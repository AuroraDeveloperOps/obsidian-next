/**
 * Provider Abstraction Layer
 *
 * Defines the interface for LLM providers (Anthropic, Ollama, etc.)
 * Enables pluggable model backends with consistent API
 */

import Anthropic from '@anthropic-ai/sdk';

export interface StreamChunk {
	type:
		| 'text'
		| 'thinking'
		| 'tool_use'
		| 'usage'
		| 'message_start'
		| 'message_delta'
		| 'content_block_start'
		| 'content_block_delta'
		| 'content_block_stop';
	text?: string;
	thinking?: string;
	toolUse?: {
		id: string;
		name: string;
		input: Record<string, unknown>;
	};
	usage?: {
		inputTokens: number;
		outputTokens: number;
		cacheReadTokens?: number;
		cacheCreationTokens?: number;
	};
	// Pass through any other chunk data
	[key: string]: any;
}

export interface ChatOptions {
	systemPrompt: string;
	tools?: Array<{
		name: string;
		description: string;
		input_schema: {
			type: 'object';
			properties: Record<string, unknown>;
			required: string[];
		};
	}>;
	maxTokens?: number;
	thinking?: {
		type: 'enabled';
		budget_tokens: number;
	};
	signal?: AbortSignal;
}

export interface ProviderCapabilities {
	streaming: boolean;
	toolCalling: boolean;
	thinking: boolean;
	caching: boolean;
	computerUse: boolean;
	vision: boolean;
}

/**
 * Abstract provider interface - all model providers must implement this
 */
export interface ModelProvider {
	/**
	 * Provider name (e.g., 'anthropic', 'ollama')
	 */
	getName(): string;

	/**
	 * Get active model identifier
	 */
	getModel(): string;

	/**
	 * Check if provider is available (API key set, service running, etc.)
	 */
	isAvailable(): Promise<boolean>;

	/**
	 * Get provider capabilities
	 */
	getCapabilities(): ProviderCapabilities;

	/**
	 * Stream chat completion
	 * Returns async generator of StreamChunk events
	 */
	chat(
		messages: Anthropic.MessageParam[],
		options: ChatOptions
	): AsyncGenerator<StreamChunk>;

	/**
	 * Count tokens in a message (for context management)
	 * Returns null if not supported
	 */
	countTokens?(
		systemPrompt: string,
		messages: Anthropic.MessageParam[],
		tools?: Array<any>
	): Promise<number | null>;
}

/**
 * Provider with model selection support
 */
export interface MultiModelProvider extends ModelProvider {
	/**
	 * Set active model
	 */
	setModel(modelName: string): void;

	/**
	 * List available models
	 */
	listModels(): Promise<string[]>;
}
