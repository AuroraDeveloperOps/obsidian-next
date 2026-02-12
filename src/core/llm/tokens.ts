/**
 * Token counting and tracking utilities
 */

import Anthropic from '@anthropic-ai/sdk';
import { bus } from '../bus.js';
import { MODEL_MAP } from './shared.js';

/**
 * Count tokens for a potential message before sending
 * Uses Anthropic's countTokens API for accurate estimation
 * Returns null on failure (caller should fall back to heuristic)
 */
export async function countTokens(
	client: Anthropic | null,
	modelConfig: string,
	systemPrompt: Anthropic.TextBlockParam[],
	messages: Anthropic.MessageParam[],
	tools?: Anthropic.Tool[]
): Promise<number | null> {
	if (!client) return null;

	try {
		const model = MODEL_MAP[modelConfig] || modelConfig;

		const response = await client.messages.countTokens({
			model,
			system: systemPrompt,
			messages,
			tools
		});
		return response.input_tokens;
	} catch (error) {
		bus.emitAgent({
			type: 'thought',
			content: '[Context] Token count API unavailable, using heuristic.',
			hidden: true
		});
		return null;
	}
}

export interface TokenAccumulator {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
}

export function createTokenAccumulator(): TokenAccumulator {
	return {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheCreationTokens: 0
	};
}

export function resetTokenAccumulator(accumulator: TokenAccumulator): void {
	accumulator.inputTokens = 0;
	accumulator.outputTokens = 0;
	accumulator.cacheReadTokens = 0;
	accumulator.cacheCreationTokens = 0;
}
