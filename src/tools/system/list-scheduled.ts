/**
 * List Scheduled Tasks Tool
 */

import { scheduler } from '../../core/scheduler.js';
import { Tool, ToolResult } from '../shared.js';

export const ListScheduledTasksTool: Tool = {
	name: 'list_scheduled_tasks',
	description:
		'List all scheduled/recurring background cron jobs. Use this when the user asks "what tasks are scheduled", "show scheduled tasks", "check scheduled jobs", "list cron jobs", or any variation asking about background recurring tasks.',
	inputSchema: {},
	requiredParams: [],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const tasks = scheduler.listTasks();
			if (tasks.length === 0) {
				return { success: true, output: 'No active scheduled tasks.' };
			}

			const header = `ID | CRON | COMMAND | LAST RUN | NEXT RUN\n${'-'.repeat(80)}`;
			const rows = tasks
				.map((t) => {
					const last = t.last_run_at
						? new Date(t.last_run_at).toLocaleString()
						: 'Never';
					const next = t.next_run_at
						? new Date(t.next_run_at).toLocaleString()
						: 'Unknown';
					return `${t.id} | ${t.cron_expression} | ${t.command} | ${last} | ${next}`;
				})
				.join('\n');

			return {
				success: true,
				output: `${header}\n${rows}`
			};
		} catch (error: unknown) {
			return {
				success: false,
				error: `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
};
