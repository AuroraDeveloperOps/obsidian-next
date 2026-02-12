/**
 * Task Tool - Manage project plan and todo list
 */

import { tasks } from '../../core/tasks.js';
import { Tool, ToolResult } from '../shared.js';

export const TaskTool: Tool = {
	name: 'task',
	description:
		'Manage the project plan and todo list. Track in-session work items, subtasks, and progress. NOT for scheduled/recurring cron jobs (use schedule_task for those). Actions: create, list, add_step, complete_step, fail_step, complete_task.',
	inputSchema: {
		action: {
			type: 'string',
			description:
				'Action to perform: create, list, add_step, complete_step, fail_step, complete_task'
		},
		title: {
			type: 'string',
			description: 'Title for new task (required for create)'
		},
		step: {
			type: 'string',
			description: 'Step description (required for add_step)'
		},
		step_index: {
			type: 'number',
			description: 'Index of step to complete/fail (required for step actions)'
		}
	},
	requiredParams: ['action'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const action = args.action as string;
		const title = args.title as string;
		const step = args.step as string;
		const stepIndex = args.step_index as number;

		if (!action) return { success: false, error: 'No action provided' };

		try {
			switch (action) {
				case 'list': {
					const progress = tasks.getProgress();
					return { success: true, output: progress };
				}

				case 'create':
					if (!title)
						return { success: false, error: 'Title required for create' };
					await tasks.create(title);
					return { success: true, output: `Created task: ${title}` };

				case 'add_step':
					if (!step) return { success: false, error: 'Step text required' };
					await tasks.addSubtask(step);
					return { success: true, output: `Added step: ${step}` };

				case 'complete_step':
					if (stepIndex === undefined)
						return { success: false, error: 'Step index required' };
					await tasks.completeSubtask(stepIndex);
					return { success: true, output: `Completed step ${stepIndex}` };

				case 'fail_step':
					if (stepIndex === undefined)
						return { success: false, error: 'Step index required' };
					// Mark the step text with a [FAILED] prefix so it's visible in progress
					const currentTask = tasks.get();
					if (!currentTask || stepIndex >= currentTask.subtasks.length) {
						return {
							success: false,
							error: `Invalid step index: ${stepIndex}`
						};
					}
					// Complete the step (marks it done) but prefix with [FAILED] to indicate failure
					const originalText = currentTask.subtasks[stepIndex].text;
					if (!originalText.startsWith('[FAILED]')) {
						// Edit the subtask text to indicate failure, then mark done
						currentTask.subtasks[stepIndex].text = `[FAILED] ${originalText}`;
						currentTask.subtasks[stepIndex].done = true;
					}
					await tasks.completeSubtask(stepIndex);
					return {
						success: true,
						output: `Marked step ${stepIndex} as failed: ${originalText}`
					};

				case 'complete_task':
					await tasks.complete();
					return { success: true, output: 'Marked task as complete' };

				default:
					return { success: false, error: `Unknown action: ${action}` };
			}
		} catch (error: unknown) {
			return {
				success: false,
				error: `Task action failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
};
