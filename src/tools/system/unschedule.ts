/**
 * Unschedule Tool - Remove a scheduled background task
 */

import { scheduler } from '../../core/scheduler.js';
import { Tool, ToolResult } from '../shared.js';

export const UnscheduleTool: Tool = {
	name: 'unschedule_task',
	description:
		'Unschedule a previously scheduled background cron job. Requires the task ID.',
	inputSchema: {
		taskId: {
			type: 'string',
			description:
				'The ID of the task to unschedule (obtained from list_scheduled_tasks).'
		}
	},
	requiredParams: ['taskId'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const taskId = args.taskId as string;

		if (!taskId) {
			return {
				success: false,
				error: 'Task ID is required to unschedule a task.'
			};
		}

		try {
			const success = await scheduler.removeTask(taskId);
			if (success) {
				return {
					success: true,
					output: `Successfully unscheduled task: ${taskId}`
				};
			} else {
				return {
					success: false,
					output: `Failed to unschedule task: ${taskId}. Task not found or already inactive.`
				};
			}
		} catch (error: unknown) {
			return {
				success: false,
				error: `Failed to unschedule task: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
};
