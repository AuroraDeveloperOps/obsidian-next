/**
 * Anthropic Provider
 *
 * Wraps the Anthropic SDK to implement the ModelProvider interface
 * Maintains all existing features: thinking, computer use, caching, vision
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
	ModelProvider,
	ProviderCapabilities,
	ChatOptions,
	StreamChunk
} from './provider.js';
import { keyManager } from '../keyManager.js';

export class AnthropicProvider implements ModelProvider {
	private client: Anthropic | null = null;
	private model: string;

	constructor(model: string = 'claude-opus-4-6-20260207') {
		this.model = model;
	}

	getName(): string {
		return 'anthropic';
	}

	getModel(): string {
		return this.model;
	}

	setModel(model: string): void {
		this.model = model;
	}

	async isAvailable(): Promise<boolean> {
		try {
			const apiKey = await keyManager.loadKey();
			if (!apiKey) return false;

			if (!this.client) {
				this.client = new Anthropic({ apiKey });
			}
			return true;
		} catch {
			return false;
		}
	}

	getCapabilities(): ProviderCapabilities {
		return {
			streaming: true,
			toolCalling: true,
			thinking: true,
			caching: true,
			computerUse: true,
			vision: true
		};
	}

	async *chat(
		messages: Anthropic.MessageParam[],
		options: ChatOptions
	): AsyncGenerator<StreamChunk> {
		if (!this.client) {
			const available = await this.isAvailable();
			if (!available) {
				throw new Error('Anthropic API not available - missing API key');
			}
		}

		const systemPromptBlock: Anthropic.TextBlockParam = {
			type: 'text',
			text: options.systemPrompt,
			cache_control: { type: 'ephemeral' }
		};

		const params: any = {
			model: this.model,
			max_tokens: options.maxTokens || 8192,
			system: [systemPromptBlock],
			messages,
			stream: true
		};

		// Add tools if provided
		if (options.tools && options.tools.length > 0) {
			params.tools = options.tools;
		}

		// Enable thinking for Opus models
		if (this.model.includes('opus') && options.thinking) {
			params.thinking = options.thinking;
		}

		const stream = (await this.client!.messages.create(params, {
			signal: options.signal
		})) as any;

		// Track current tool use
		let currentToolUse: { id: string; name: string; input: string } | null =
			null;

		for await (const chunk of stream) {
			// Message start - extract usage
			if (chunk.type === 'message_start' && chunk.message?.usage) {
				yield {
					type: 'message_start',
					usage: {
						inputTokens: chunk.message.usage.input_tokens || 0,
						outputTokens: chunk.message.usage.output_tokens || 0,
						cacheReadTokens:
							(chunk.message.usage as any).cache_read_input_tokens || 0,
						cacheCreationTokens:
							(chunk.message.usage as any).cache_creation_input_tokens || 0
					}
				};
			}

			// Message delta - extract output tokens
			if (chunk.type === 'message_delta' && chunk.usage) {
				yield {
					type: 'message_delta',
					usage: {
						inputTokens: 0,
						outputTokens: chunk.usage.output_tokens || 0
					}
				};
			}

			// Thinking blocks
			if (
				chunk.type === 'content_block_start' &&
				chunk.content_block?.type === 'thinking'
			) {
				yield { type: 'content_block_start', ...chunk };
			}

			if (
				chunk.type === 'content_block_delta' &&
				chunk.delta?.type === 'thinking_delta'
			) {
				const thinkingText = (chunk.delta as any).thinking;
				if (thinkingText) {
					yield { type: 'thinking', thinking: thinkingText };
				}
			}

			// Text blocks
			if (
				chunk.type === 'content_block_delta' &&
				chunk.delta?.type === 'text_delta'
			) {
				yield { type: 'text', text: chunk.delta.text };
			}

			// Tool use blocks
			if (
				chunk.type === 'content_block_start' &&
				chunk.content_block?.type === 'tool_use'
			) {
				currentToolUse = {
					id: chunk.content_block.id,
					name: chunk.content_block.name,
					input: ''
				};
			}

			if (
				chunk.type === 'content_block_delta' &&
				chunk.delta?.type === 'input_json_delta'
			) {
				if (currentToolUse) {
					currentToolUse.input += chunk.delta.partial_json;
				}
			}

			if (chunk.type === 'content_block_stop' && currentToolUse) {
				try {
					const input = currentToolUse.input
						? JSON.parse(currentToolUse.input)
						: {};
					yield {
						type: 'tool_use',
						toolUse: {
							id: currentToolUse.id,
							name: currentToolUse.name,
							input
						}
					};
				} catch {
					// Failed to parse - yield with empty object
					yield {
						type: 'tool_use',
						toolUse: {
							id: currentToolUse.id,
							name: currentToolUse.name,
							input: {}
						}
					};
				}
				currentToolUse = null;
			}

			// Pass through other events
			if (chunk.type === 'content_block_stop') {
				yield { type: 'content_block_stop', ...chunk };
			}
		}
	}

	async countTokens(
		systemPrompt: string,
		messages: Anthropic.MessageParam[],
		tools?: Array<any>
	): Promise<number | null> {
		if (!this.client) return null;

		try {
			const systemPromptBlock: Anthropic.TextBlockParam = {
				type: 'text',
				text: systemPrompt
			};

			const response = await this.client.messages.countTokens({
				model: this.model,
				system: [systemPromptBlock],
				messages,
				tools: tools as any
			});
			return response.input_tokens;
		} catch {
			return null;
		}
	}
}
