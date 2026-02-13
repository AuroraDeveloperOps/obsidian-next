/**
 * Ollama Provider
 *
 * Integrates with local Ollama server for offline model execution
 * Supports: FuncGemma (function calling), SmolLM (chat), and other Ollama models
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
	ModelProvider,
	MultiModelProvider,
	ProviderCapabilities,
	ChatOptions,
	StreamChunk
} from './provider.js';

interface OllamaMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	tool_calls?: Array<{
		id: string;
		type: 'function';
		function: {
			name: string;
			arguments: string;
		};
	}>;
}

interface OllamaStreamChunk {
	model: string;
	created_at: string;
	message?: {
		role: string;
		content: string;
		tool_calls?: Array<{
			id: string;
			type: 'function';
			function: {
				name: string;
				arguments: string;
			};
		}>;
	};
	done: boolean;
}

export class OllamaProvider implements MultiModelProvider {
	private baseUrl: string;
	private model: string;
	private abortController: AbortController | null = null;

	constructor(
		baseUrl: string = 'http://localhost:11434',
		model: string = 'smollm:latest'
	) {
		this.baseUrl = baseUrl;
		this.model = model;
	}

	getName(): string {
		return 'ollama';
	}

	getModel(): string {
		return this.model;
	}

	setModel(model: string): void {
		this.model = model;
	}

	async isAvailable(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`, {
				signal: AbortSignal.timeout(2000)
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	getCapabilities(): ProviderCapabilities {
		// List of model families known to support the Ollama tools API
		const toolCapableFamilies = [
			'llama3.1',
			'llama3.2',
			'qwen2.5',
			'mistral',
			'mixtral',
			'command-r',
			'firefunction',
			'functiongemma',
			'funcgemma'
		];

		const supportsTools = toolCapableFamilies.some(family => 
			this.model.toLowerCase().includes(family)
		);

		return {
			streaming: true,
			toolCalling: supportsTools,
			thinking: false,
			caching: false,
			computerUse: false,
			vision: this.model.includes('llava') || this.model.includes('moondream')
		};
	}

	async listModels(): Promise<string[]> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`);
			const data = await response.json();
			return data.models?.map((m: any) => m.name) || [];
		} catch {
			return [];
		}
	}

	/**
	 * Convert Anthropic message format to Ollama format
	 */
	private convertMessages(messages: Anthropic.MessageParam[]): OllamaMessage[] {
		return messages.map((msg) => {
			// Handle string content
			if (typeof msg.content === 'string') {
				return {
					role: msg.role as 'user' | 'assistant',
					content: msg.content
				};
			}

			// Handle array content (tool_use, tool_result, text blocks)
			if (Array.isArray(msg.content)) {
				const textBlocks = msg.content
					.filter((block: any) => block.type === 'text')
					.map((block: any) => block.text);

				const toolUseBlocks = msg.content.filter(
					(block: any) => block.type === 'tool_use'
				);

				// If there are tool uses, convert to Ollama tool_calls format
				if (toolUseBlocks.length > 0) {
					return {
						role: 'assistant',
						content: textBlocks.join('\n') || '',
						tool_calls: toolUseBlocks.map((block: any) => ({
							id: block.id,
							type: 'function' as const,
							function: {
								name: block.name,
								arguments: JSON.stringify(block.input)
							}
						}))
					};
				}

				// Tool results - convert to text format for Ollama
				const toolResultBlocks = msg.content.filter(
					(block: any) => block.type === 'tool_result'
				);
				if (toolResultBlocks.length > 0) {
					const resultText = toolResultBlocks
						.map((block: any) => {
							let content =
								typeof block.content === 'string'
									? block.content
									: JSON.stringify(block.content);
							
							// Truncate massive tool results for Ollama (max 5k chars)
							if (content.length > 5000) {
								content = content.slice(0, 2500) + "\n... [TRUNCATED] ...\n" + content.slice(-2500);
							}
							
							return `[Tool Result]: ${content}`;
						})
						.join('\n\n');

					return {
						role: 'user',
						content: resultText
					};
				}

				return {
					role: msg.role as 'user' | 'assistant',
					content: textBlocks.join('\n')
				};
			}

			return {
				role: msg.role as 'user' | 'assistant',
				content: String(msg.content)
			};
		});
	}

	/**
	 * Convert tool definitions to Ollama format (OpenAI-compatible)
	 */
	private convertTools(tools?: Array<any>): Array<any> | undefined {
		if (!tools || tools.length === 0) return undefined;

		return tools.map((tool) => ({
			type: 'function',
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.input_schema
			}
		}));
	}

	async *chat(
		messages: Anthropic.MessageParam[],
		options: ChatOptions
	): AsyncGenerator<StreamChunk> {
		this.abortController = new AbortController();
		const signal = options.signal || this.abortController.signal;

		const ollamaMessages = this.convertMessages(messages);

		// Prepend system message if provided
		if (options.systemPrompt) {
			ollamaMessages.unshift({
				role: 'system',
				content: options.systemPrompt
			});
		}

		const requestBody: any = {
			model: this.model,
			messages: ollamaMessages,
			stream: true,
			options: {
				temperature: 0.7,
				num_predict: options.maxTokens || 2048
			}
		};

		// Add tools if supported by model
		if (this.getCapabilities().toolCalling && options.tools) {
			requestBody.tools = this.convertTools(options.tools);
		}

		try {
			// Combine user signal with a 5-minute safety timeout
			const timeoutSignal = AbortSignal.timeout(300000);
			const combinedSignal = signal ? 
				(AbortSignal as any).any([signal, timeoutSignal]) : 
				timeoutSignal;

			const response = await fetch(`${this.baseUrl}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody),
				signal: combinedSignal
			});

			if (!response.ok) {
				throw new Error(
					`Ollama API error: ${response.status} ${response.statusText}`
				);
			}

			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('Response body is null');
			}

			const decoder = new TextDecoder();
			let buffer = '';
			let totalInputTokens = 0;
			let totalOutputTokens = 0;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim()) continue;

					try {
						const chunk: OllamaStreamChunk = JSON.parse(line);

						// First chunk - emit usage estimate
						if (totalOutputTokens === 0) {
							// Estimate input tokens (rough: 4 chars = 1 token)
							const estimatedInput = Math.ceil(
								JSON.stringify(ollamaMessages).length / 4
							);
							totalInputTokens = estimatedInput;

							yield {
								type: 'message_start',
								usage: {
									inputTokens: totalInputTokens,
									outputTokens: 0
								}
							};
						}

						// Extract content
						if (chunk.message?.content) {
							totalOutputTokens += Math.ceil(chunk.message.content.length / 4);
							yield { type: 'text', text: chunk.message.content };
						}

						// Extract tool calls
						if (chunk.message?.tool_calls) {
							for (const toolCall of chunk.message.tool_calls) {
								try {
									const input = JSON.parse(toolCall.function.arguments);
									yield {
										type: 'tool_use',
										toolUse: {
											id: toolCall.id || `tool_${Date.now()}`,
											name: toolCall.function.name,
											input
										}
									};
								} catch {
									// Failed to parse arguments
								}
							}
						}

						// Done - emit final usage
						if (chunk.done) {
							yield {
								type: 'message_delta',
								usage: {
									inputTokens: 0,
									outputTokens: totalOutputTokens
								}
							};
						}
					} catch (e) {
						// Skip invalid JSON lines
						console.error('[Ollama] Failed to parse chunk:', line);
					}
				}
			}
		} finally {
			this.abortController = null;
		}
	}

	/**
	 * Ollama doesn't support token counting API
	 */
	async countTokens(): Promise<number | null> {
		return null;
	}
}
