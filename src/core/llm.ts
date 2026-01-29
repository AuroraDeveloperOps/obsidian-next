import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { bus } from './bus.js';
import { usage } from './usage.js';
import { tools } from './tools.js';

export class LLMClient {
    private client: Anthropic | null = null;
    private lastConfig: any = null;
    private conversationHistory: Anthropic.MessageParam[] = [];

    async initialize() {
        const cfg = await config.load();
        await usage.init();
        if (!cfg.apiKey) {
            bus.emitAgent({
                type: 'error',
                message: 'Missing ANTHROPIC_API_KEY. Please set it in .env or via /init.'
            });
            return false;
        }

        this.client = new Anthropic({
            apiKey: cfg.apiKey,
        });
        this.lastConfig = cfg;
        return true;
    }

    async streamChat(userMessage: string) {
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
                this.conversationHistory.push({
                    role: 'user',
                    content: userMessage
                });
            }

            // Define available tools for Claude
            const toolDefinitions = tools.list().map(tool => ({
                name: tool.name,
                description: tool.description,
                input_schema: {
                    type: 'object',
                    properties: this.getToolSchema(tool.name),
                    required: this.getRequiredParams(tool.name)
                }
            }));

            const systemPrompt = `You are Obsidian Next, a professional AI coding assistant with tools to interact with the user's workspace.

Available tools:
- bash: Execute shell commands (git, npm, tests, etc.)
- read: Read file contents with line numbers
- write: Create new files (fails if file exists)
- edit: Edit files using exact search/replace
- list: List directory contents
- grep: Search for patterns in code (regex supported)

Best practices:
1. Read files before editing to understand context
2. Use grep to find relevant code before making changes
3. Make small, targeted edits with exact search strings
4. Use bash for git operations, running tests, and builds
5. Be concise - avoid unnecessary explanations
6. When editing, include enough context in search string to be unique

Working directory: ${process.cwd()}`;

            const createMessage = async (model: string) => {
                return await this.client!.messages.create({
                    model,
                    max_tokens: this.lastConfig?.maxTokens || 8192,
                    system: systemPrompt,
                    messages: [...this.conversationHistory],
                    tools: toolDefinitions,
                    stream: true,
                });
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
                }

                if (chunk.type === 'message_delta' && chunk.usage) {
                    outputTokens += chunk.usage.output_tokens || 0;
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
                    const result = await tools.execute(toolUse.name, toolUse.input);
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: result.success ? (result.output || 'Success') : (result.error || 'Failed'),
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

            await usage.track(currentModel, inputTokens, outputTokens);

            return fullResponse;

        } catch (error: any) {
            bus.emitAgent({
                type: 'error',
                message: `LLM Error: ${error.message}`
            });
            return null;
        }
    }

    private getToolSchema(toolName: string): Record<string, any> {
        // Define JSON schemas for each tool's parameters
        const schemas: Record<string, any> = {
            bash: {
                command: {
                    type: 'string',
                    description: 'The shell command to execute'
                }
            },
            read: {
                path: {
                    type: 'string',
                    description: 'Path to the file to read (relative to workspace)'
                }
            },
            write: {
                path: {
                    type: 'string',
                    description: 'Path where to create the new file'
                },
                content: {
                    type: 'string',
                    description: 'Content to write to the file'
                }
            },
            edit: {
                path: {
                    type: 'string',
                    description: 'Path to the file to edit'
                },
                search: {
                    type: 'string',
                    description: 'Text to search for (must match exactly)'
                },
                replace: {
                    type: 'string',
                    description: 'Text to replace with'
                }
            },
            list: {
                path: {
                    type: 'string',
                    description: 'Directory path to list (defaults to current directory)'
                }
            },
            grep: {
                pattern: {
                    type: 'string',
                    description: 'Regex pattern to search for'
                },
                path: {
                    type: 'string',
                    description: 'Directory to search in (defaults to current directory)'
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results (default: 50)'
                }
            }
        };

        return schemas[toolName] || {};
    }

    private getRequiredParams(toolName: string): string[] {
        const required: Record<string, string[]> = {
            bash: ['command'],
            read: ['path'],
            write: ['path', 'content'],
            edit: ['path', 'search', 'replace'],
            list: [],
            grep: ['pattern']
        };

        return required[toolName] || [];
    }

    clearHistory(): void {
        this.conversationHistory = [];
    }
}

export const llm = new LLMClient();
