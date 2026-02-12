/**
 * Memory Tool - Long-term memory storage and recall
 */

import { Tool, ToolResult } from '../shared.js';

export const MemoryTool: Tool = {
	name: 'memory',
	description:
		'Store and recall long-term memories: user preferences, project facts, and learned patterns. Use this to remember user information across sessions.',
	inputSchema: {
		action: {
			type: 'string',
			description: 'Action: store, recall, search, list, forget'
		},
		type: {
			type: 'string',
			description:
				'Memory type: user_preference, project_fact, decision_log, learned_pattern (for store)'
		},
		key: {
			type: 'string',
			description: 'Unique key for the memory (for store, recall, forget)'
		},
		content: {
			type: 'string',
			description: 'Content to store (for store action)'
		},
		query: {
			type: 'string',
			description: 'Search query (for search action)'
		}
	},
	requiredParams: ['action'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const { memory } = await import('../../core/memory.js');
		const action = args.action as string;
		const type = args.type as string | undefined;
		const key = args.key as string | undefined;
		const content = args.content as string | undefined;
		const query = args.query as string | undefined;

		await memory.init();

		if (action === 'store') {
			if (!key || !content) {
				return { success: false, error: 'store requires key and content' };
			}
			const memoType = (type ||
				'user_preference') as import('../../core/memory.js').MemoType;
			const success = await memory.store(memoType, key, content);
			if (success) {
				return { success: true, output: `Stored memory: ${key}` };
			}
			return { success: false, error: 'Failed to store memory' };
		}

		if (action === 'recall') {
			if (!key) {
				return { success: false, error: 'recall requires key' };
			}
			const memo = await memory.recall(key);
			if (memo) {
				return {
					success: true,
					output: `[${memo.type}] ${memo.key}: ${memo.content}`
				};
			}
			return { success: true, output: `No memory found for key: ${key}` };
		}

		if (action === 'search') {
			if (!query) {
				return { success: false, error: 'search requires query' };
			}
			const memos = await memory.search(
				query,
				type as import('../../core/memory.js').MemoType | undefined
			);
			if (memos.length === 0) {
				return { success: true, output: 'No memories found matching query' };
			}
			const lines = memos.map((m) => `- [${m.type}] ${m.key}: ${m.content}`);
			return {
				success: true,
				output: `Found ${memos.length} memories:\n${lines.join('\n')}`
			};
		}

		if (action === 'list') {
			const memoType = type as
				| import('../../core/memory.js').MemoType
				| undefined;
			let memos: import('../../core/memory.js').Memo[];

			if (memoType) {
				memos = await memory.getByType(memoType);
				if (memos.length === 0) {
					return {
						success: true,
						output: `No ${memoType} memories found`
					};
				}
				const lines = memos.map((m) => `- ${m.key}: ${m.content}`);
				return {
					success: true,
					output: `${memoType} memories:\n${lines.join('\n')}`
				};
			} else {
				// List summary of everything
				const stats = await memory.getStats();
				const allMemos: string[] = [];

				for (const t of Object.keys(stats.byType)) {
					const typeMemos = await memory.getByType(
						t as import('../../core/memory.js').MemoType
					);
					if (typeMemos.length > 0) {
						allMemos.push(`--- ${t} ---`);
						allMemos.push(...typeMemos.map((m) => `- ${m.key}: ${m.content}`));
					}
				}

				if (allMemos.length === 0)
					return {
						success: true,
						output: 'No memories found in any category.'
					};
				return {
					success: true,
					output: `Current Memory Bank:\n${allMemos.join('\n')}`
				};
			}
		}

		if (action === 'forget') {
			if (!key) {
				return { success: false, error: 'forget requires key' };
			}
			const success = await memory.forget(key);
			if (success) {
				return { success: true, output: `Forgot memory: ${key}` };
			}
			return { success: false, error: 'Failed to forget memory' };
		}

		return {
			success: false,
			error: `Unknown action: ${action}. Valid: store, recall, search, list, forget`
		};
	}
};
