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

export class LLMClient {
    private client: Anthropic | null = null;
    private lastConfig: any = null;
    private conversationHistory: Anthropic.MessageParam[] = [];
    private toolIterations = 0;
    private accumulatedInputTokens = 0;
    private accumulatedOutputTokens = 0;
    private abortController: AbortController | null = null;

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

    async streamChat(userMessage: string): Promise<string | null> {
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
            // 1. Warn at 80% (160k)
            // 2. Prune Aggressively at 90% (180k)
            // 3. Hard Stop at 98% (196k)
            const contextLimit = 200_000;
            const currentUsage = Math.max(this.accumulatedInputTokens, await usage.getContextUsage(apiModel).used); // Heuristic

            if (currentUsage > contextLimit * 0.98) {
                bus.emitAgent({
                    type: 'error',
                    message: `[SAFETY] Context limit reached (${(currentUsage / 1000).toFixed(1)}k). Please run /clear to reset.`
                });
                return null;
            }

            if (currentUsage > contextLimit * 0.90) {
                bus.emitAgent({
                    type: 'thought',
                    content: `[SAFETY] CRITICAL CONTEXT LEVEL (${(currentUsage / 1000).toFixed(1)}k). Aggressive pruning engaged.`
                });
                this.pruneHistory(); // Trigger pruning
            } else if (currentUsage > contextLimit * 0.80) {
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

            const toolDefinitions = availableTools.map(tool => ({
                name: tool.name,
                description: tool.description,
                input_schema: {
                    type: 'object',
                    properties: tool.inputSchema,
                    required: tool.requiredParams
                }
            }));

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
            this.pruneHistory();

            // Cache Control Strategy:
            // 1. System Prompt (static, huge) - Always cached
            // 2. Tool Definitions (static, huge) - Always cached
            // 3. Last user turn (checkpoint) - Cached every 5 turns

            // Construct System Prompt with Caching
            const systemPromptBlock: Anthropic.TextBlockParam = {
                type: 'text',
                text: `You are an expert coding agent called Obsidian.
Your persona is friendly but serious, professional, and hyper-focused on code quality, security, and best practices.

CORE DIRECTIVES:
1. EXPLORE FIRST: Never assume the state of the codebase. Use list and grep to explore. Read files completely before editing.
2. CODE QUALITY:
   - Write strict, type-safe TypeScript. Avoid any.
   - Prefer modular, functional code.
   - properly handle errors. Don't swallow exceptions.
3. TOOL MASTERY:
   - EDIT: precision is key. Use unique context strings. If an edit fails, READ the file again to find unique context.
   - BASH: Use valid commands. Don't use interactive commands (vim, nano).
   - MCP: usage is encouraged. You have access to a dynamic set of tools.
   - Lifecycle: If a tool you need is from an OFFLINE server, you MUST use mcp_manage connect before using its tools.
4. DOCUMENTATION PRIORITY:
   - For library documentation, Next.js/React best practices, or API references, ALWAYS prioritize context7 tools.
   - Do not rely on internal training data for documentation if a certified source is available.
5. COMMUNICATION:
   - Be concise. One thought, then act.
   - STRICTLY FORBIDDEN: Do not use ANY Markdown formatting symbols in your thought process. 
   - No **bold**, no *italics*, no # headers, no [links], no \`code\`.
   - Use ONLY plain text for thoughts.
6. SECURITY:
   - Never output API keys or secrets.
   - Don't read outside the workspace unless necessary (system paths).

WORKFLOW:
1. Analyze: Understand the request.
2. Explore: Find relevant files (ls, find, grep).
3. Read: Load content (read).
4. Plan: Decide on changes.
5. Act: Execute changes (edit, write, mcp_manage).
6. Verify: Check your work (diff, lint, test).

Current Working Directory: ${process.cwd()}

CAPABILITIES:

Active (Ready to use):
${activeList}

${offlineList ? `Offline (Configured but disconnected):\n${offlineList}\n` : ''}
${registryList ? `Installable (New capabilities):\n${registryList}\n` : ''}`,
                cache_control: { type: 'ephemeral' }
            };

            this.abortController = new AbortController();
            const signal = this.abortController.signal;

            const interruptHandler = () => {
                if (this.abortController) {
                    this.abortController.abort();
                    bus.emitAgent({ type: 'thought', content: '[Stop] Interrupted by user.' });
                }
            };

            bus.on('user', (e: any) => {
                if (e.type === 'user_interrupt') interruptHandler();
            });

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
                    tools: toolDefinitions as Anthropic.Tool[], // Cast to satisfy SDK types
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
            let toolUses: any[] = [];
            let currentToolUse: any = null;

            for await (const chunk of stream) {
                if (chunk.type === 'message_start' && chunk.message && chunk.message.usage) {
                    inputTokens += chunk.message.usage.input_tokens || 0;
                    outputTokens += chunk.message.usage.output_tokens || 0;

                    // Track Cache Metrics
                    // @ts-ignore - SDK types might trail API updates
                    if (chunk.message.usage.cache_read_input_tokens) cacheReadTokens += chunk.message.usage.cache_read_input_tokens;
                    // @ts-ignore
                    if (chunk.message.usage.cache_creation_input_tokens) cacheCreationTokens += chunk.message.usage.cache_creation_input_tokens;

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

                // Add tool results to history
                this.conversationHistory.push({
                    role: 'user',
                    content: toolResults
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
            const currentContextSize = inputTokens + cacheReadTokens + cacheCreationTokens;

            // Track accumulated tokens including cache metrics
            // We pass the *accumulated* tokens for cost tracking, but the *current* context size for health tracking
            await usage.track(
                currentModel,
                this.accumulatedInputTokens,
                this.accumulatedOutputTokens,
                cacheReadTokens, // These vars (cacheReadTokens) accumulate within the loop? 
                cacheCreationTokens,
                currentContextSize
            );

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
        }
    }

    /**
     * History Pruning (Context Editing)
     * Keep recent 30 messages + System Prompt (handled separate)
     * Limit history to ~150k tokens (heuristic)
     */
    private pruneHistory() {
        const MAX_MESSAGES = 40;
        if (this.conversationHistory.length > MAX_MESSAGES) {
            const keepFirst = 2; // Keep first user message (intent)
            const keepLast = 20; // Keep extensive recent context

            // Remove middle chunk
            const removalCount = this.conversationHistory.length - (keepFirst + keepLast);
            if (removalCount > 0) {
                const keptStart = this.conversationHistory.slice(0, keepFirst);
                const keptEnd = this.conversationHistory.slice(-keepLast);

                this.conversationHistory = [
                    ...keptStart,
                    { role: 'user', content: `[... History Pruned: ${removalCount} intermediate messages were removed to save context ...]` },
                    ...keptEnd
                ];

                bus.emitAgent({
                    type: 'thought',
                    content: `[Context] Pruned ${removalCount} old messages to maintain efficiency.`,
                    hidden: true
                });
            }
        }
    }

    clearHistory(): void {
        this.conversationHistory = [];
    }
}

export const llm = new LLMClient();
