import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { bus } from './bus.js';

export class LLMClient {
    private client: Anthropic | null = null;

    async initialize() {
        const cfg = await config.load();
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
        return true;
    }

    /**
     * Streams a response from Claude.
     * Emits 'thought' events for chunks, and returns the final text.
     */
    async streamChat(userMessage: string) {
        if (!this.client) {
            const initialized = await this.initialize();
            if (!initialized || !this.client) return null;
        }

        try {
            const stream = await this.client.messages.create({
                model: 'claude-3-5-sonnet-20241022', // Hardcoded reliable model for now
                max_tokens: 4096,
                messages: [{ role: 'user', content: userMessage }],
                stream: true,
            });

            let fullResponse = '';

            for await (const chunk of stream) {
                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                    const text = chunk.delta.text;
                    fullResponse += text;

                    // Emit minimal thoughts effectively acting as a stream
                    // In a real agent, we might buffer lines or use a dedicated stream event
                    bus.emitAgent({
                        type: 'thought',
                        content: text // simplistic streaming for now
                    });
                }
            }

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
