import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { bus } from './bus.js';
import { usage } from './usage.js';

export class LLMClient {
    private client: Anthropic | null = null;
    private lastConfig: any = null;

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

            const createMessage = async (model: string) => {
                return await this.client!.messages.create({
                    model,
                    max_tokens: this.lastConfig?.maxTokens || 8192,
                    messages: [{ role: 'user', content: userMessage }],
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

            for await (const chunk of stream) {
                if (chunk.type === 'message_start' && chunk.message && chunk.message.usage) {
                    inputTokens += chunk.message.usage.input_tokens || 0;
                }

                if (chunk.type === 'message_delta' && chunk.usage) {
                    outputTokens += chunk.usage.output_tokens || 0;
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
}

export const llm = new LLMClient();
