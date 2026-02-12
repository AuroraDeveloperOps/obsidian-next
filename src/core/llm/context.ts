/**
 * Context management - compression and summarization
 */

import Anthropic from '@anthropic-ai/sdk';
import { bus } from '../bus.js';
import { CONTEXT } from './shared.js';

/**
 * Summarize a block of conversation messages
 */
export async function summarizeBlock(
	client: Anthropic | null,
	summarizerModel: string,
	messages: Anthropic.MessageParam[]
): Promise<string> {
	if (!client) return 'Summary unavailable.';

	const simplifiedMessages: Anthropic.MessageParam[] = messages.map((m) => {
		if (Array.isArray(m.content)) {
			const textContent = m.content
				.map((b) => {
					if (b.type === 'text') return b.text;
					if (b.type === 'tool_use') return `[Tool Use: ${b.name}]`;
					if (b.type === 'tool_result')
						return `[Tool Result: ${typeof b.content === 'string' ? b.content.slice(0, 500) + '...' : 'Data'}]`;
					return '';
				})
				.join('\n');
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

	const response = await client.messages.create({
		model: summarizerModel,
		max_tokens: 1024,
		messages: [{ role: 'user', content: prompt }]
	});

	if (response.content[0].type === 'text') {
		return response.content[0].text;
	}
	return 'Summary generation returned non-text content.';
}

/**
 * Compress history using summarization
 */
export async function compressHistory(
	client: Anthropic | null,
	summarizerModel: string,
	conversationHistory: Anthropic.MessageParam[]
): Promise<Anthropic.MessageParam[]> {
	if (conversationHistory.length <= CONTEXT.MAX_MESSAGES) {
		return conversationHistory;
	}

	if (conversationHistory.length < CONTEXT.MAX_MESSAGES + CONTEXT.BUFFER) {
		return conversationHistory;
	}

	const summarizeStart = CONTEXT.KEEP_FIRST;
	const summarizeEnd = conversationHistory.length - CONTEXT.KEEP_LAST;
	const messagesToSummarize = conversationHistory.slice(
		summarizeStart,
		summarizeEnd
	);

	if (messagesToSummarize.length < 5) return conversationHistory;

	bus.emitAgent({
		type: 'thought',
		content: `[Context] Compressing ${messagesToSummarize.length} messages using ${summarizerModel}...`,
		hidden: true
	});

	try {
		const summary = await summarizeBlock(
			client,
			summarizerModel,
			messagesToSummarize
		);

		try {
			const { memory } = await import('../memory.js');
			await memory.store(
				'daily_summary',
				`context_compression_${Date.now()}`,
				summary
			);
		} catch (memError) {
			// Non-fatal
		}

		const keptStart = conversationHistory.slice(0, CONTEXT.KEEP_FIRST);
		const keptEnd = conversationHistory.slice(summarizeEnd);

		const newHistory = [
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

		return newHistory as Anthropic.MessageParam[];
	} catch (error) {
		bus.emitAgent({
			type: 'error',
			message: `[Context] Summarization failed: ${error}. Falling back to standard pruning.`
		});
		return pruneHistoryFallback(conversationHistory);
	}
}

/**
 * Fallback pruning when summarization fails
 */
export function pruneHistoryFallback(
	conversationHistory: Anthropic.MessageParam[]
): Anthropic.MessageParam[] {
	if (conversationHistory.length <= CONTEXT.MAX_MESSAGES) {
		return conversationHistory;
	}

	const keepFirst = CONTEXT.KEEP_FIRST;
	const keepLast = 20;

	const removalCount = conversationHistory.length - (keepFirst + keepLast);
	if (removalCount > 0) {
		const keptStart = conversationHistory.slice(0, keepFirst);
		const keptEnd = conversationHistory.slice(-keepLast);

		return [
			...keptStart,
			{
				role: 'user',
				content: `[... History Pruned: ${removalCount} intermediate messages were removed to save context ...]`
			},
			...keptEnd
		] as Anthropic.MessageParam[];
	}

	return conversationHistory;
}
