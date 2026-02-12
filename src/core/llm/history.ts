/**
 * Conversation history management utilities
 */

import Anthropic from '@anthropic-ai/sdk';
import { bus } from '../bus.js';
import { ContentBlock } from './shared.js';

/**
 * Persist current history to DB
 */
export async function persistHistory(
	conversationHistory: Anthropic.MessageParam[],
	sessionId: string | null
): Promise<void> {
	if (!sessionId) return;

	try {
		const { db } = await import('../database.js');
		db.getDb()
			.prepare('UPDATE sessions SET llm_history = ? WHERE id = ?')
			.run(JSON.stringify(conversationHistory), sessionId);
	} catch (e) {
		bus.emitAgent({
			type: 'thought',
			content: `[Context] Failed to persist LLM history: ${e instanceof Error ? e.message : String(e)}`,
			hidden: true
		});
	}
}

/**
 * Verify history integrity - check that all tool_results have matching tool_uses
 */
export function verifyHistoryIntegrity(
	history: Anthropic.MessageParam[]
): boolean {
	for (let i = 0; i < history.length; i++) {
		const msg = history[i];
		const prevMsg = history[i - 1];

		if (msg.role === 'user' && Array.isArray(msg.content)) {
			const toolResults = (msg.content as unknown as ContentBlock[]).filter(
				(b) => b.type === 'tool_result'
			);

			if (toolResults.length > 0) {
				if (
					!prevMsg ||
					prevMsg.role !== 'assistant' ||
					!Array.isArray(prevMsg.content)
				) {
					return false;
				}

				const toolUseIds = new Set(
					(prevMsg.content as unknown as ContentBlock[])
						.filter((b) => b.type === 'tool_use')
						.map((b) => b.id)
				);

				for (const tr of toolResults) {
					if (!toolUseIds.has(tr.tool_use_id)) {
						return false;
					}
				}
			}
		}
	}
	return true;
}

/**
 * Validate conversation history and remove orphaned tool blocks
 * - Each tool_use must have a corresponding tool_result in the next message
 * - Each tool_result must have a corresponding tool_use in the previous message
 */
export function validateAndFixHistory(
	history: Anthropic.MessageParam[]
): Anthropic.MessageParam[] {
	const validated: Anthropic.MessageParam[] = [];

	for (let i = 0; i < history.length; i++) {
		const msg = history[i];
		const nextMsg = history[i + 1];
		const prevMsg = validated[validated.length - 1];

		if (msg.role === 'user' && Array.isArray(msg.content)) {
			const toolResultBlocks = (msg.content as unknown as ContentBlock[]).filter(
				(b) => b.type === 'tool_result'
			);

			if (toolResultBlocks.length > 0) {
				if (
					!prevMsg ||
					prevMsg.role !== 'assistant' ||
					!Array.isArray(prevMsg.content)
				) {
					const nonToolBlocks = (
						msg.content as unknown as ContentBlock[]
					).filter((b) => b.type !== 'tool_result');
					if (nonToolBlocks.length > 0) {
						validated.push({
							role: 'user',
							content: nonToolBlocks as unknown as Anthropic.ContentBlockParam[]
						});
					}
					continue;
				}

				const toolUseIds = new Set(
					(prevMsg.content as unknown as ContentBlock[])
						.filter((b) => b.type === 'tool_use')
						.map((b) => b.id)
				);

				const validToolResults = toolResultBlocks.filter((tr) =>
					toolUseIds.has(tr.tool_use_id as string)
				);
				const nonToolBlocks = (msg.content as unknown as ContentBlock[]).filter(
					(b) => b.type !== 'tool_result'
				);

				if (validToolResults.length !== toolResultBlocks.length) {
					if (validToolResults.length === 0 && nonToolBlocks.length > 0) {
						validated.push({
							role: 'user',
							content: nonToolBlocks as unknown as Anthropic.ContentBlockParam[]
						});
						continue;
					} else if (validToolResults.length > 0) {
						validated.push({
							role: 'user',
							content: [
								...nonToolBlocks,
								...validToolResults
							] as unknown as Anthropic.ContentBlockParam[]
						});
						continue;
					}
					continue;
				}
			}
		}

		if (msg.role === 'assistant' && Array.isArray(msg.content)) {
			const toolUseBlocks = (msg.content as unknown as ContentBlock[]).filter(
				(b) => b.type === 'tool_use'
			);

			if (toolUseBlocks.length > 0) {
				if (
					!nextMsg ||
					nextMsg.role !== 'user' ||
					!Array.isArray(nextMsg.content)
				) {
					const textBlocks = (msg.content as unknown as ContentBlock[]).filter(
						(b) => b.type === 'text'
					);
					if (textBlocks.length > 0) {
						validated.push({
							role: 'assistant',
							content: textBlocks.map((b) => b.text as string).join('\n')
						});
					}
					continue;
				}

				const toolResultIds = new Set(
					(nextMsg.content as unknown as ContentBlock[])
						.filter((b) => b.type === 'tool_result')
						.map((b) => b.tool_use_id)
				);

				const validToolUses = toolUseBlocks.filter((tu) =>
					toolResultIds.has(tu.id as string)
				);

				if (validToolUses.length !== toolUseBlocks.length) {
					const textBlocks = (msg.content as unknown as ContentBlock[]).filter(
						(b) => b.type === 'text'
					);
					if (validToolUses.length === 0 && textBlocks.length > 0) {
						validated.push({
							role: 'assistant',
							content: textBlocks.map((b) => b.text as string).join('\n')
						});
						continue;
					} else if (validToolUses.length > 0) {
						validated.push({
							role: 'assistant',
							content: [
								...textBlocks,
								...validToolUses
							] as unknown as Anthropic.ContentBlockParam[]
						});
						continue;
					}
					continue;
				}
			}
		}

		validated.push(msg);
	}

	return validated;
}
