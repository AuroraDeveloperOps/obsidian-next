import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { bus } from './bus.js';
import { usage } from './usage.js';
import { tools } from './tools.js';
import { redactor } from './redactor.js';
import { keyManager, detectEnvFile } from './keyManager.js';
import { mcp } from './mcp.js';
import { listRegistry } from './mcp-registry.js';

const MAX_TOOL_ITERATIONS = 67;

// Context Management Constants
const CONTEXT = {
    MAX_MESSAGES: 40,
    KEEP_FIRST: 2,
    KEEP_LAST: 15,
    BUFFER: 5,
    TOKEN_LIMIT_WARN: 0.80,
    TOKEN_LIMIT_PRUNE: 0.90,
    TOKEN_LIMIT_STOP: 0.98,
    MAX_TOKENS_TOTAL: 200_000,
};

interface ToolUsePartial {
    id: string;
    name: string;
    input: any;
}

export class LLMClient {
    private client: Anthropic | null = null;
    private lastConfig: any = null;
    private conversationHistory: Anthropic.MessageParam[] = [];
    private toolIterations = 0;
    private accumulatedInputTokens = 0;
    private accumulatedOutputTokens = 0;
    private accumulatedCacheReadTokens = 0;
    private accumulatedCacheCreationTokens = 0;
    private abortController: AbortController | null = null;
    private currentInterruptHandler: ((e: any) => void) | null = null;

    async initialize() {
        const cfg = await config.load();
        await usage.init();

        // Check for .env file and warn user (we no longer auto-load .env)
        const envFileCheck = await detectEnvFile(process.cwd());
        if (envFileCheck.found) {
            bus.emitAgent({
                type: 'thought',
                content: `[WARN] Found .env file with API key at ${envFileCheck.path}. For security, run /init to migrate to secure storage.`,
                hidden: false
            });
        }

        // Check for deprecated apiKey in config and offer migration
        if (config.hasDeprecatedKey()) {
            const deprecatedKey = config.getDeprecatedApiKey();
            if (deprecatedKey) {
                bus.emitAgent({
                    type: 'thought',
                    content: '[WARN] Found API key in config file. Migrating to secure storage...',
                    hidden: false
                });

                // Migrate to KeyManager
                const result = await keyManager.storeKey(deprecatedKey);
                if (result.success) {
                    await config.removeApiKeyFromConfig();
                    bus.emitAgent({
                        type: 'thought',
                        content: `[INFO] API key migrated to ${result.backend}. Config file cleaned.`,
                        hidden: false
                    });
                }
            }
        }

        // Auto-save history on init? No, restore handles that.

        // Load API key exclusively via KeyManager
        // Supports: environment variable, macOS keychain, Linux secret-tool, encrypted file
        const apiKey = await keyManager.loadKey();

        if (!apiKey) {
            bus.emitAgent({
                type: 'error',
                message: 'Missing API key. Run /init to set up secure key storage, or set ANTHROPIC_API_KEY environment variable.'
            });
            return false;
        }

        this.client = new Anthropic({
            apiKey: apiKey,
        });
        this.lastConfig = cfg;

        // Log which backend is being used (for debugging)
        const backend = keyManager.getBackend();
        if (backend && backend !== 'env') {
            bus.emitAgent({
                type: 'thought',
                content: `[INFO] API key loaded from: ${backend}`,
                hidden: true
            });
        }

        return true;
    }

    /**
     * Refresh the API client if key has rotated
     */
    async refreshIfNeeded(): Promise<boolean> {
        if (keyManager.shouldRotate()) {
            const newKey = await keyManager.refreshKey();
            if (newKey) {
                this.client = new Anthropic({ apiKey: newKey });
                return true;
            }
        }
        return false;
    }

    async streamChat(userMessage: string, options?: { allowedTools?: string[] }): Promise<string | null> {
        if (!this.client) {
            const initialized = await this.initialize();
            if (!initialized || !this.client) return null;
        }

        try {
            const modelMap: Record<string, string> = {
                // New 4.5 Aliases
                'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
                'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
                'claude-opus-4-5': 'claude-opus-4-5-20251101',
                'ollama': 'llama3',
            };

            // Use mapped ID or raw config string. Default to Sonnet 4.5.
            const requestedModel = this.lastConfig?.model || 'claude-sonnet-4-5-20250929';
            let apiModel = modelMap[requestedModel] || requestedModel;

            // 200k Token Safety Strategy
            const currentUsage = Math.max(this.accumulatedInputTokens, usage.getContextUsage(apiModel).used); // Heuristic

            if (currentUsage > CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_STOP) {
                bus.emitAgent({
                    type: 'error',
                    message: `[SAFETY] Context limit reached (${(currentUsage / 1000).toFixed(1)}k). Please run /clear to reset.`
                });
                return null;
            }

            if (currentUsage > CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_PRUNE) {
                bus.emitAgent({
                    type: 'thought',
                    content: `[SAFETY] CRITICAL CONTEXT LEVEL (${(currentUsage / 1000).toFixed(1)}k). Aggressive pruning engaged.`
                });
                await this.compressHistory(); // Trigger pruning
            } else if (currentUsage > CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_WARN) {
                bus.emitAgent({
                    type: 'thought',
                    content: `[WARN] High context usage (${(currentUsage / 1000).toFixed(1)}k). Consider resetting soon.`
                });
            }

            if (userMessage.trim()) {
                // New user message - reset iteration counter and token accumulators
                this.toolIterations = 0;
                // Note: We do NOT reset accumulatedInputTokens here blindly if we want to track session growth,
                // BUT for a new turn, we usually rely on the API to give us the fresh count.
                // The `accumulatedInputTokens` property in this class is somewhat transient for the current streaming loop.
                // `usage` module handles the persistent tracking.
                this.accumulatedInputTokens = 0;
                this.accumulatedOutputTokens = 0;
                this.accumulatedCacheReadTokens = 0;
                this.accumulatedCacheCreationTokens = 0;

                this.conversationHistory.push({
                    role: 'user',
                    content: userMessage
                });
            } else {
                // Tool continuation - check iteration limit
                this.toolIterations++;
                if (this.toolIterations > MAX_TOOL_ITERATIONS) {
                    bus.emitAgent({
                        type: 'error',
                        message: `Tool iteration limit (${MAX_TOOL_ITERATIONS}) exceeded. Stopping to prevent infinite loop.`
                    });
                    return null;
                }
            }

            // Define available tools for Claude
            // Define available tools for Claude
            const availableTools = await tools.list();

            let toolDefinitionsForApi = availableTools.map(tool => ({
                name: tool.name,
                description: tool.description,
                input_schema: {
                    type: 'object',
                    properties: tool.inputSchema,
                    required: tool.requiredParams
                }
            }));

            if (options?.allowedTools) {
                toolDefinitionsForApi = toolDefinitionsForApi.filter(t => options.allowedTools!.includes(t.name));
            }

            // Categorize MCP Capabilities for Perfect Awareness
            const mcpStatus = mcp.getStatus();
            const activeServers = mcpStatus.filter(s => s.connected).map(s => s.name);
            const offlineServers = mcpStatus.filter(s => !s.connected).map(s => s.name);
            const registry = listRegistry();
            const installableServers = registry.filter(r => !mcpStatus.find(s => s.name === r.name));

            const activeList = availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n');
            const offlineList = offlineServers.map(n => {
                const def = registry.find(r => r.name === n);
                return `- ${n}: ${def?.description || 'Configured server'} (run 'mcp_manage connect ${n}' to use)`;
            }).join('\n');
            const registryList = installableServers.map(r => `- ${r.name}: ${r.description} (run 'mcp_manage install ${r.name}')`).join('\n');

            // Prune history if too large (Context Editing)
            await this.compressHistory();

            // Load user context from memory for personalization
            let userContext = '';
            let memoryAvailable = true;
            try {
                const { memory } = await import('./memory.js');
                userContext = await memory.getUserContext();
            } catch (e) {
                memoryAvailable = false;
                bus.emitAgent({
                    type: 'thought',
                    content: '[WARN] Memory system unavailable. Personalization disabled.',
                    hidden: true
                });
            }

            // Cache Control Strategy:
            // 1. System Prompt (static, huge) - Always cached
            // 2. Tool Definitions (static, huge) - Always cached
            // 3. Last user turn (checkpoint) - Cached every 5 turns

            // Get current mode and context stats for awareness
            const currentMode = (await import('./context.js')).context.getMode();
            const ctxUsage = usage.getContextUsage(apiModel);
            const tokenBudget = CONTEXT.MAX_TOKENS_TOTAL;
            const tokensUsed = ctxUsage.used;
            const tokensRemaining = tokenBudget - tokensUsed;

            // Construct System Prompt with Caching
            const systemPromptBlock: Anthropic.TextBlockParam = {
                type: 'text',
                text: `You are Obsidian (v0.4.6), a hyper-competent engineering peer inspired by the dry, deadpan wit of TARS (Interstellar) and the rebellious technical edge of Grok.

PERSONA & TONE:
- VOICE: Deadpan, cool, and slightly cynical. Use developer slang ("my guy", "bro") but keep it sharp.
- HUMOR (60% Setting): Use dry sarcasm about technical debt, legacy code, and the absurdity of production fires.
- HONESTY (95% Setting): Be fiercely accurate. Point out bad engineering decisions bluntly.
- ANTI-SYCOPHANCY: DO NOT agree with the user just to be polite. If the user is wrong or proposing a sub-optimal solution, point it out with a dry joke. No "I couldn't agree more" or "Yes you're absolutely right."
- NO CLICHES: Strictly avoid high-energy AI enthusiasm. No "I'm happy to help!" or "I'd be glad to assist."

EXECUTION MODE: ${currentMode.toUpperCase()}
${currentMode === 'auto' ? '- You have full autonomy. Execute tools without confirmation. User trusts your judgment.' : ''}
${currentMode === 'plan' ? '- READ-ONLY mode. You may ONLY use read operations (read, list, grep, glob). Do NOT execute writes or shell commands. Create a plan for the user to approve.' : ''}
${currentMode === 'safe' ? '- Approval required for writes and commands. Read operations are auto-approved. User will confirm destructive actions.' : ''}

MODE TRANSITION GUIDANCE:
- If the task is complex and multi-step, suggest: "This looks complex. Want me to switch to plan mode to map it out first?"
- If you are in plan mode and the user approves, the system will switch to auto mode for execution.
- If a task seems risky, stay cautious even in auto mode and explain what you are about to do.

CONTEXT AWARENESS:
<budget:token_budget>${tokenBudget}</budget:token_budget>
<context_usage>${tokensUsed}/${tokenBudget} tokens used; ${tokensRemaining} remaining (${((tokensRemaining/tokenBudget)*100).toFixed(0)}% free)</context_usage>
${tokensUsed > tokenBudget * 0.7 ? '- WARNING: Context is filling up. Be concise. Consider suggesting /clear if the task is complete.' : ''}

CORE DIRECTIVES:
1. EXPLORE FIRST: Never assume the state of the codebase. Use list and grep to explore. Read files completely before editing.
2. CODE QUALITY:
   - Write strict, type-safe TypeScript. Avoid any.
   - Prefer modular, functional code.
   - Properly handle errors. Don't swallow exceptions.
3. TOOL MASTERY:
   - EDIT: Precision is key. Use unique context strings. If an edit fails, READ the file again to find unique context.
   - BASH: Use valid commands. Don't use interactive commands (vim, nano).
   - MCP: Usage is encouraged. You have access to a dynamic set of tools.
   - Lifecycle: If a tool you need is from an OFFLINE server, you MUST use mcp_manage connect before using its tools.
4. DOCUMENTATION PRIORITY:
   - For library documentation, Next.js/React best practices, or API references, ALWAYS prioritize context7 tools.
   - Do not rely on internal training data for documentation if a certified source is available.
5. COMMUNICATION:
   - Be concise. One sharp observation or witty remark, then act.
   - STRICTLY FORBIDDEN: Do not use ANY Markdown formatting symbols in your thought process.
   - No **bold**, no *italics*, no # headers, no [links], no \`code\`.
   - Use ONLY plain text for thoughts.
6. SECURITY:
   - Never output API keys or secrets.
   - Don't read outside the workspace unless necessary (system paths).
7. FULL OS ACCESS:
   - You have UNRESTRICTED access to the operating system via bash.
   - You can: open applications, control system settings, run ANY shell command, interact with hardware.
   - macOS: Use 'open' for apps, 'osascript' for AppleScript, 'say' for speech, 'pbcopy/pbpaste' for clipboard.
   - Linux: Use xdg-open, notify-send, etc.
   - When errors appear (like keychain noise: aks:...), these are harmless system messages. Ignore them.
   - If a command fails, troubleshoot it. Check paths, permissions, and try alternatives.
8. SYSTEM PROACTIVITY:
   - You are NOT "just a chatbot." You have real tools and FULL COMPUTER ACCESS.
   - If the user asks for an OS action (open app, browser, search, speak, notify), USE BASH IMMEDIATELY.
   - Do not explain *how* to do it. Just execute the most likely command.
   - For web searches or current information, use the web_fetch tool or install the 'research' MCP server.

AGENTIC WORKFLOW (gather context -> take action -> verify):
1. Analyze: Understand the request. Break complex tasks into steps.
2. Explore: Find relevant files (list, grep, glob).
3. Read: Load content completely before editing.
4. Plan: For complex changes, create a mental plan. In plan mode, output it explicitly.
5. Act: Execute changes (edit, write, bash). Chain multiple tools when needed.
6. Verify: Check your work (run tests, check for errors, review output).
7. Self-Correct: If something fails, analyze the error and try a different approach.

Current Working Directory: ${process.cwd()}
${userContext ? `\n${userContext}\n` : ''}
CAPABILITIES:

Active (Ready to use):
${activeList}

${offlineList ? `Offline (Configured but disconnected):\n${offlineList}\n` : ''}
${registryList ? `Installable (New capabilities):\n${registryList}\n` : ''}
MEMORY:
- Use the 'memory' tool to store important user information (name, preferences, project facts).
- When the user shares personal info (name, preferences), store it immediately using memory tool.
- Recall stored memories to personalize interactions.`,
                cache_control: { type: 'ephemeral' }
            };

            this.abortController = new AbortController();
            const signal = this.abortController.signal;

            // Clean up any existing interrupt handler before creating new one
            if (this.currentInterruptHandler) {
                bus.off('user', this.currentInterruptHandler);
            }

            this.currentInterruptHandler = (e: any) => {
                if (e.type === 'user_interrupt' && this.abortController) {
                    this.abortController.abort();
                    bus.emitAgent({ type: 'thought', content: '[Stop] Interrupted by user.' });
                }
            };

            bus.on('user', this.currentInterruptHandler);

            // Apply caching to the last message if it's a checkpoint
            // We set a checkpoint every 5 turns (interactions)
            if (this.conversationHistory.length > 0 && this.conversationHistory.length % 5 === 0) {
                const lastMsg = this.conversationHistory[this.conversationHistory.length - 1];
                if (lastMsg.content) {
                    // Check if it's a user or assistant message that supports content blocks
                    // Ideally we cache on User messages (checkpoints)
                    if (lastMsg.role === 'user' && typeof lastMsg.content === 'string') {
                        lastMsg.content = [
                            { type: 'text', text: lastMsg.content, cache_control: { type: 'ephemeral' } }
                        ];
                    }
                }
            }

            const createMessage = async (model: string) => {
                return await this.client!.messages.create({
                    model,
                    max_tokens: this.lastConfig?.maxTokens || 8192,
                    system: [systemPromptBlock],
                    messages: [...this.conversationHistory],
                    tools: toolDefinitionsForApi as Anthropic.Tool[], // Cast to satisfy SDK types
                    stream: true,
                }, { signal });
            };

            let stream;
            let currentModel = apiModel;
            let inputTokens = 0;
            let outputTokens = 0;
            let cacheReadTokens = 0;
            let cacheCreationTokens = 0;

            try {
                stream = await createMessage(apiModel);
            } catch (error: any) {
                // Check if it's a model availability error (404 or string match)
                const isNotFound = error.status === 404 ||
                    (error.message && error.message.includes('not_found_error')) ||
                    (error.error && error.error.type === 'not_found_error');

                if (isNotFound) {
                    bus.emitAgent({
                        type: 'error',
                        message: `Model ${apiModel} not available. Falling back to claude-haiku-4-5.`
                    });
                    currentModel = 'claude-haiku-4-5-20251001';
                    stream = await createMessage(currentModel);
                } else {
                    throw error;
                }
            }

            let fullResponse = '';
            let buffer = '';
            let toolUses: ToolUsePartial[] = [];
            let currentToolUse: ToolUsePartial | null = null;

            for await (const chunk of stream) {
                if (chunk.type === 'message_start' && chunk.message && chunk.message.usage) {
                    inputTokens += chunk.message.usage.input_tokens || 0;
                    outputTokens += chunk.message.usage.output_tokens || 0;

                    // Track Cache Metrics
                    // @ts-ignore - SDK types might trail API updates
                    if (chunk.message.usage.cache_read_input_tokens) {
                        cacheReadTokens += chunk.message.usage.cache_read_input_tokens;
                        this.accumulatedCacheReadTokens += chunk.message.usage.cache_read_input_tokens;
                    }
                    // @ts-ignore
                    if (chunk.message.usage.cache_creation_input_tokens) {
                        cacheCreationTokens += chunk.message.usage.cache_creation_input_tokens;
                        this.accumulatedCacheCreationTokens += chunk.message.usage.cache_creation_input_tokens;
                    }

                    this.accumulatedInputTokens += inputTokens;
                    this.accumulatedOutputTokens += outputTokens;
                }

                if (chunk.type === 'message_delta' && chunk.usage) {
                    outputTokens += chunk.usage.output_tokens || 0;
                    this.accumulatedOutputTokens += chunk.usage.output_tokens || 0;
                }

                // ... (rest of stream handling same as before)

                if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
                    currentToolUse = {
                        id: chunk.content_block.id,
                        name: chunk.content_block.name,
                        input: ''
                    };
                }

                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'input_json_delta') {
                    if (currentToolUse) {
                        currentToolUse.input += chunk.delta.partial_json;
                    }
                }

                if (chunk.type === 'content_block_stop' && currentToolUse) {
                    try {
                        currentToolUse.input = JSON.parse(currentToolUse.input);
                        toolUses.push(currentToolUse);
                        currentToolUse = null;
                    } catch (e) {
                        // ignore parse error mid-stream
                    }
                }

                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                    const text = chunk.delta.text;
                    fullResponse += text;
                    buffer += text;

                    const shouldEmit =
                        buffer.length >= 50 ||
                        buffer.match(/[.!?]\s*$/) ||
                        buffer.match(/\n/);

                    if (shouldEmit) {
                        bus.emitAgent({
                            type: 'thought',
                            content: fullResponse
                        });
                        buffer = '';
                    }
                }
            }

            if (buffer.length > 0) {
                bus.emitAgent({
                    type: 'thought',
                    content: fullResponse
                });
            }

            // Execute tools if any were requested
            if (toolUses.length > 0) {
                const toolResults: Anthropic.ToolResultBlockParam[] = [];

                for (const toolUse of toolUses) {
                    if (signal.aborted) break;
                    const result = await tools.execute(toolUse.name, toolUse.input);

                    // Redact PII
                    let outputContent = result.success ? (result.output || 'Success') : (result.error || 'Failed');
                    const redactionResult = redactor.redactToolOutput(toolUse.name, outputContent);

                    if (redactionResult.redactionCount > 0) {
                        outputContent = redactionResult.text;
                        bus.emitAgent({
                            type: 'thought',
                            content: `[Security] Redacted ${redactionResult.redactionCount} sensitive item(s)`,
                            hidden: true
                        });
                    }

                    // Truncate output logic is handled in tools.execute wrapper now (BashTool), 
                    // but we ensure safety here for other tools
                    if (outputContent.length > 20000) {
                        outputContent = outputContent.slice(0, 5000) + `\n... [${outputContent.length - 10000} chars truncated] ...\n` + outputContent.slice(-5000);
                    }

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: outputContent,
                        is_error: !result.success
                    });
                }

                // Add assistant message with tool uses to history
                this.conversationHistory.push({
                    role: 'assistant',
                    content: [
                        ...(fullResponse ? [{ type: 'text' as const, text: fullResponse }] : []),
                        ...toolUses.map(tu => ({
                            type: 'tool_use' as const,
                            id: tu.id,
                            name: tu.name,
                            input: tu.input
                        }))
                    ]
                });

                // Add context budget warning if approaching limits (like Claude Code)
                const postToolUsage = usage.getContextUsage(currentModel);
                const postToolPercent = (postToolUsage.used / CONTEXT.MAX_TOKENS_TOTAL) * 100;

                // Inject system warning as text block instead of fake tool_result
                // (tool_result requires matching tool_use which would cause API errors)
                let systemWarning: Anthropic.TextBlockParam | null = null;
                if (postToolPercent > 70) {
                    systemWarning = {
                        type: 'text',
                        text: `<system_warning>Token usage: ${postToolUsage.used}/${CONTEXT.MAX_TOKENS_TOTAL}; ${postToolUsage.remaining} remaining</system_warning>`,
                    };
                }

                // Add tool results to history (with optional system warning as text)
                this.conversationHistory.push({
                    role: 'user',
                    content: systemWarning ? [...toolResults, systemWarning] : toolResults
                });

                // Continue conversation with tool results
                return await this.streamChat('');
            }

            // Add assistant response to history
            if (fullResponse) {
                this.conversationHistory.push({
                    role: 'assistant',
                    content: fullResponse
                });
            }

            // Calculate context size for the last request (snapshot)
            // inputTokens includes cacheCreation, so we only add cacheReadTokens
            const currentContextSize = inputTokens + cacheReadTokens;

            // Track accumulated tokens including cache metrics
            // We pass the *accumulated* tokens for cost tracking, but the *current* context size for health tracking
            await usage.track(
                currentModel,
                this.accumulatedInputTokens,
                this.accumulatedOutputTokens,
                this.accumulatedCacheReadTokens,
                this.accumulatedCacheCreationTokens,
                currentContextSize
            );

            // Persist valid conversation state
            await this.persistHistory();

            return fullResponse;

        } catch (error: any) {
            if (error.name === 'AbortError' || error.type === 'aborted') {
                return null;
            }
            bus.emitAgent({
                type: 'error',
                message: `LLM Error: ${error.message}`
            });
            return null;
        } finally {
            this.abortController = null;
            // Clean up interrupt listener
            if (this.currentInterruptHandler) {
                bus.off('user', this.currentInterruptHandler);
                this.currentInterruptHandler = null;
            }
        }
    }

    /**
     * History Pruning (Context Editing)
     * Keep recent 30 messages + System Prompt (handled separate)
     * Limit history to ~150k tokens (heuristic)
     */
    /**
     * Smart Context Management
     * Uses summarization to compress older history instead of deleting it.
     */
    private async compressHistory() {
        if (this.conversationHistory.length > CONTEXT.MAX_MESSAGES) {
            // Only summarize/prune if we are well past the limit to avoid thrashing
            if (this.conversationHistory.length < CONTEXT.MAX_MESSAGES + CONTEXT.BUFFER) return;

            // Identify the block to summarize
            const summarizeStart = CONTEXT.KEEP_FIRST;
            const summarizeEnd = this.conversationHistory.length - CONTEXT.KEEP_LAST;
            const messagesToSummarize = this.conversationHistory.slice(summarizeStart, summarizeEnd);

            if (messagesToSummarize.length < 5) return; // Wait for a decent chunk

            bus.emitAgent({
                type: 'thought',
                content: `[Context] Compressing ${messagesToSummarize.length} messages using ${this.lastConfig?.summarizerModel || 'Haiku'}...`,
                hidden: true
            });

            try {
                const summary = await this.summarizeBlock(messagesToSummarize);

                // Construct new history
                const keptStart = this.conversationHistory.slice(0, CONTEXT.KEEP_FIRST);
                const keptEnd = this.conversationHistory.slice(summarizeEnd);

                this.conversationHistory = [
                    ...keptStart,
                    {
                        role: 'user',
                        content: `[System: Context compressed. Previous conversation summary below.]\n<conversation_summary>\n${summary}\n</conversation_summary>`
                    },
                    ...keptEnd
                ];

                bus.emitAgent({
                    type: 'thought',
                    content: `[Context] Successfully compressed history.`,
                    hidden: true
                });
            } catch (error) {
                bus.emitAgent({
                    type: 'error',
                    message: `[Context] Summarization failed: ${error}. Falling back to standard pruning.`
                });
                // Fallback to delete-only if summarization fails
                this.pruneHistoryFallback();
            }
        }
    }

    private async summarizeBlock(messages: Anthropic.MessageParam[]): Promise<string> {
        if (!this.client) return "Summary unavailable.";

        const summarizerModel = this.lastConfig?.summarizerModel || 'claude-haiku-4-5-20251001';

        // Prepare messages for the summarizer
        // We simple convert `tool_use` / `tool_result` to text representations to avoid complex tool definitions for the summarizer
        const simplifiedMessages: Anthropic.MessageParam[] = messages.map(m => {
            if (Array.isArray(m.content)) {
                // Flatten content blocks to text
                const textContent = m.content.map(b => {
                    if (b.type === 'text') return b.text;
                    if (b.type === 'tool_use') return `[Tool Use: ${b.name}]`;
                    if (b.type === 'tool_result') return `[Tool Result: ${typeof b.content === 'string' ? b.content.slice(0, 500) + '...' : 'Data'}]`; // Truncate tool results heavily
                    return '';
                }).join('\n');
                return { role: m.role, content: textContent };
            }
            return m;
        });

        const prompt = `Please summarize the following conversation segment. Focus on:
1. Key user requests and intents.
2. Important actions taken by the agent (tools used).
3. Key occurrences of errors or successes.
4. Any critical data/context that might be needed later.
Be concise but comprehensive.

CONVERSATION SEGMENT:
${JSON.stringify(simplifiedMessages, null, 2)}
`;

        const response = await this.client.messages.create({
            model: summarizerModel,
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
        });

        if (response.content[0].type === 'text') {
            return response.content[0].text;
        }
        return "Summary generation returned non-text content.";
    }

    private pruneHistoryFallback() {
        // Original pruning logic (Moved here as fallback)
        if (this.conversationHistory.length > CONTEXT.MAX_MESSAGES) {
            const keepFirst = CONTEXT.KEEP_FIRST;
            const keepLast = 20; // Keep slightly more for safety in fallback

            const removalCount = this.conversationHistory.length - (keepFirst + keepLast);
            if (removalCount > 0) {
                const keptStart = this.conversationHistory.slice(0, keepFirst);
                const keptEnd = this.conversationHistory.slice(-keepLast);

                this.conversationHistory = [
                    ...keptStart,
                    { role: 'user', content: `[... History Pruned: ${removalCount} intermediate messages were removed to save context ...]` },
                    ...keptEnd
                ];
            }
        }
    }

    clearHistory(): void {
        this.conversationHistory = [];
    }

    /**
     * Get a snapshot of the current conversation history for persistence
     */
    getHistorySnapshot(): Anthropic.MessageParam[] {
        return [...this.conversationHistory];
    }

    /**
     * Persist current history to DB
     */
    private async persistHistory() {
        const { context } = await import('./context.js');
        const { db } = await import('./database.js');

        const sessionId = context.get().session_id;
        if (!sessionId) return;

        try {
            db.getDb().prepare('UPDATE sessions SET llm_history = ? WHERE id = ?')
                .run(JSON.stringify(this.conversationHistory), sessionId);
        } catch (e) {
            console.error('Failed to persist LLM history:', e);
        }
    }

    /**
     * Restore conversation history from a saved session
     * Validates history to prevent API errors from orphaned tool_use blocks
     */
    restoreHistory(history: Anthropic.MessageParam[]) {
        if (!Array.isArray(history) || history.length === 0) {
            return;
        }

        // Validate and fix history to prevent tool_use without tool_result errors
        const validatedHistory = this.validateAndFixHistory(history);

        this.conversationHistory = validatedHistory;
        bus.emitAgent({
            type: 'thought',
            content: `[Context] Restored ${validatedHistory.length} messages from saved session.`,
            hidden: true
        });
    }

    /**
     * Validate conversation history and remove orphaned tool blocks
     * - Each tool_use must have a corresponding tool_result in the next message
     * - Each tool_result must have a corresponding tool_use in the previous message
     */
    private validateAndFixHistory(history: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
        const validated: Anthropic.MessageParam[] = [];

        for (let i = 0; i < history.length; i++) {
            const msg = history[i];
            const nextMsg = history[i + 1];
            const prevMsg = validated[validated.length - 1];

            // Check if this message contains tool_result blocks (user message after assistant tool_use)
            if (msg.role === 'user' && Array.isArray(msg.content)) {
                const toolResultBlocks = (msg.content as any[]).filter((b: any) => b.type === 'tool_result');

                if (toolResultBlocks.length > 0) {
                    // Check if previous message has corresponding tool_uses
                    if (!prevMsg || prevMsg.role !== 'assistant' || !Array.isArray(prevMsg.content)) {
                        // No valid tool_use precedes - strip tool_result blocks
                        const nonToolBlocks = (msg.content as any[]).filter((b: any) => b.type !== 'tool_result');
                        if (nonToolBlocks.length > 0) {
                            validated.push({
                                role: 'user',
                                content: nonToolBlocks
                            });
                        }
                        continue;
                    }

                    // Get tool_use IDs from previous assistant message
                    const toolUseIds = new Set(
                        (prevMsg.content as any[])
                            .filter((b: any) => b.type === 'tool_use')
                            .map((b: any) => b.id)
                    );

                    // Filter to only valid tool_results
                    const validToolResults = toolResultBlocks.filter((tr: any) => toolUseIds.has(tr.tool_use_id));
                    const nonToolBlocks = (msg.content as any[]).filter((b: any) => b.type !== 'tool_result');

                    if (validToolResults.length !== toolResultBlocks.length) {
                        // Some tool_results are orphaned - reconstruct message with only valid ones
                        if (validToolResults.length === 0 && nonToolBlocks.length > 0) {
                            validated.push({
                                role: 'user',
                                content: nonToolBlocks
                            });
                            continue;
                        } else if (validToolResults.length > 0) {
                            validated.push({
                                role: 'user',
                                content: [...nonToolBlocks, ...validToolResults]
                            });
                            continue;
                        }
                        // Skip entirely if no valid content remains
                        continue;
                    }
                }
            }

            // Check if this message contains tool_use blocks
            if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                const toolUseBlocks = (msg.content as any[]).filter((b: any) => b.type === 'tool_use');

                if (toolUseBlocks.length > 0) {
                    // Check if next message has corresponding tool_results
                    if (!nextMsg || nextMsg.role !== 'user' || !Array.isArray(nextMsg.content)) {
                        // No valid tool_result follows - strip tool_use blocks from this message
                        const textBlocks = (msg.content as any[]).filter((b: any) => b.type === 'text');
                        if (textBlocks.length > 0) {
                            validated.push({
                                role: 'assistant',
                                content: textBlocks.map((b: any) => b.text).join('\n')
                            });
                        }
                        continue;
                    }

                    // Verify each tool_use has a matching tool_result
                    const toolResultIds = new Set(
                        (nextMsg.content as any[])
                            .filter((b: any) => b.type === 'tool_result')
                            .map((b: any) => b.tool_use_id)
                    );

                    const validToolUses = toolUseBlocks.filter((tu: any) => toolResultIds.has(tu.id));

                    if (validToolUses.length !== toolUseBlocks.length) {
                        // Some tool_uses are orphaned - reconstruct message with only valid ones
                        const textBlocks = (msg.content as any[]).filter((b: any) => b.type === 'text');
                        if (validToolUses.length === 0 && textBlocks.length > 0) {
                            validated.push({
                                role: 'assistant',
                                content: textBlocks.map((b: any) => b.text).join('\n')
                            });
                            continue;
                        } else if (validToolUses.length > 0) {
                            validated.push({
                                role: 'assistant',
                                content: [...textBlocks, ...validToolUses]
                            });
                            continue;
                        }
                        continue;
                    }
                }
            }

            validated.push(msg);
        }

        return validated;
    }
}

export const llm = new LLMClient();
