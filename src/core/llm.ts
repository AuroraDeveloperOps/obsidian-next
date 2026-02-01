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

            // Add user message to history (skip if empty - used for tool continuations)
            if (userMessage.trim()) {
                // New user message - reset iteration counter and token accumulators
                this.toolIterations = 0;
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

            const systemPrompt = `You are an expert coding agent called Obsidian.
Your persona is friendly but serious, professional, and hyper-focused on code quality, security, and best practices.

**Core Directives:**
1. **Explore First:** Never assume the state of the codebase. Use \`list\` and \`grep\` to explore. Read files completely before editing.
2. **Code Quality:**
   - Write strict, type-safe TypeScript. Avoid \`any\`.
   - Prefer modular, functional code.
   - properly handle errors. Don't swallow exceptions.
3. **Tool Mastery:**
   - **Edit:** precision is key. Use unique context strings. If an edit fails, READ the file again to find unique context.
   - **Bash:** Use valid commands. Don't use interactive commands (vim, nano).
   - **MCP:** usage is encouraged. You have access to a dynamic set of tools.
   - **Lifecycle:** If a tool you need is from an OFFLINE server, you MUST use \`mcp_manage connect <name>\` before using its tools.
4. **Documentation Priority:**
   - For library documentation, Next.js/React best practices, or API references, ALWAYS prioritize \`context7\` tools.
   - Do not rely on internal training data for documentation if a certified source is available.
5. **Communication:**
   - Be concise. One thought, then act.
   - No Markdown formatting in your thought process (no \`**bold**\` or \`# headers\`).
6. **Security:**
   - Never output API keys or secrets.
   - Don't read outside the workspace unless necessary (system paths).

**Workflow:**
1. **Analyze**: Understand the request.
2. **Explore**: Find relevant files (ls, find, grep).
3. **Read**: Load content (read).
4. **Plan**: Decide on changes.
5. **Act**: Execute changes (edit, write, mcp_manage).
6. **Verify**: Check your work (diff, lint, test).

Current Working Directory: ${process.cwd()}

### Capabilities

**Active (Ready to use):**
${activeList}

${offlineList ? `**Offline (Configured but disconnected):**\n${offlineList}\n` : ''}
${registryList ? `**Installable (New capabilities):**\n${registryList}\n` : ''}`;

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

            const createMessage = async (model: string) => {
                return await this.client!.messages.create({
                    model,
                    max_tokens: this.lastConfig?.maxTokens || 8192,
                    system: systemPrompt,
                    messages: [...this.conversationHistory],
                    tools: toolDefinitions as Anthropic.Tool[], // Cast to satisfy SDK types
                    stream: true,
                }, { signal });
            };

            let stream;
            let currentModel = apiModel;
            let inputTokens = 0;
            let outputTokens = 0;
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
                    this.accumulatedInputTokens += chunk.message.usage.input_tokens || 0;
                }

                if (chunk.type === 'message_delta' && chunk.usage) {
                    outputTokens += chunk.usage.output_tokens || 0;
                    this.accumulatedOutputTokens += chunk.usage.output_tokens || 0;
                }

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
                        bus.emitAgent({
                            type: 'error',
                            message: `Failed to parse tool input: ${e}`
                        });
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

                    // Redact PII from tool output before sending to LLM
                    let outputContent = result.success ? (result.output || 'Success') : (result.error || 'Failed');
                    const redactionResult = redactor.redactToolOutput(toolUse.name, outputContent);

                    if (redactionResult.redactionCount > 0) {
                        outputContent = redactionResult.text;
                        // Log redaction for transparency (hidden from user)
                        bus.emitAgent({
                            type: 'thought',
                            content: `[Security] Redacted ${redactionResult.redactionCount} sensitive item(s): ${redactionResult.redactedTypes.join(', ')}`,
                            hidden: true
                        });
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

            // Track accumulated tokens from all iterations (only at final response)
            await usage.track(currentModel, this.accumulatedInputTokens, this.accumulatedOutputTokens);

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
            // Note: In a real app we'd want to remove the exact listener, 
            // but for simplicity here we'd need to store the function reference.
            // Let's use a more modular approach if possible or just rely on the controller null check.
        }
    }



    clearHistory(): void {
        this.conversationHistory = [];
    }
}

export const llm = new LLMClient();
