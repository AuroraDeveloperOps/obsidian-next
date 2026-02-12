/**
 * /exit command - Graceful shutdown with session save
 *
 * 1. Saves session state (context, history, tasks)
 * 2. Shows summary of work done
 * 3. Returns session ID for /resume
 * 4. Signals clean shutdown
 */

import { bus } from '../core/bus.js';
import { session } from '../core/session.js';
import { context } from '../core/context.js';
import { tasks } from '../core/tasks.js';
import { usage } from '../core/usage.js';
import { CommandHandler } from '../core/commands.js';

export const exitCommand: CommandHandler = async (args) => {
	const forceExit = args.includes('--force') || args.includes('-f');
	const noSave = args.includes('--no-save');

	// Emit shutdown request
	bus.emitAgent({ type: 'shutdown_request' });

	// Check for pending tasks
	const task = tasks.get();
	const hasPendingWork = task && task.status !== 'done';

	if (hasPendingWork && !forceExit) {
		const pendingSubtasks = task!.subtasks.filter((s) => !s.done);

		bus.emitAgent({
			type: 'thought',
			content: [
				'[WARN] Session has pending work:',
				`  Task: ${task!.title}`,
				`  Status: ${task!.status}`,
				`  Pending subtasks: ${pendingSubtasks.length}`,
				'',
				pendingSubtasks.length > 0
					? pendingSubtasks.map((s) => `  - ${s.text}`).join('\n')
					: '',
				'',
				'Use /exit --force to exit anyway, or continue working.'
			]
				.filter(Boolean)
				.join('\n')
		});

		// Don't exit, let user decide
		return;
	}

	// Save session unless --no-save
	let sessionId = context.get().session_id;
	let sessionPath = '';

	if (!noSave) {
		try {
			const result = await session.save();
			sessionId = result.sessionId;
			sessionPath = result.path;

			bus.emitAgent({
				type: 'session_saved',
				sessionId,
				path: sessionPath
			});
		} catch (error) {
			bus.emitAgent({
				type: 'error',
				message: `Failed to save session: ${error instanceof Error ? error.message : String(error)}`
			});
		}
	}

	// Generate and emit summary
	const summary = await session.getSummary();
	const duration = session.formatDuration(summary.duration);
	const ctx = context.get();

	const summaryLines = [
		'='.repeat(50),
		'SESSION SUMMARY',
		'='.repeat(50),
		'',
		`Session ID: ${sessionId}`,
		`Duration:   ${duration}`,
		'',
		'[Activity]',
		`  Files read:     ${summary.filesRead}`,
		`  Files modified: ${summary.filesModified}`,
		`  Tasks done:     ${summary.tasksCompleted}`,
		`  Tasks pending:  ${summary.tasksPending}`,
		'',
		'[Cost]',
		`  Session total:  $${summary.totalCost.toFixed(4)}`,
		''
	];

	// Add modified files list if any
	if (ctx.files_modified.length > 0) {
		summaryLines.push('[Modified Files]');
		for (const file of ctx.files_modified.slice(-10)) {
			summaryLines.push(`  - ${file}`);
		}
		if (ctx.files_modified.length > 10) {
			summaryLines.push(`  ... and ${ctx.files_modified.length - 10} more`);
		}
		summaryLines.push('');
	}

	// Add current task info if any
	if (task) {
		summaryLines.push('[Current Task]');
		summaryLines.push(`  ${task.title}`);
		summaryLines.push(`  Status: ${task.status}`);
		if (task.subtasks.length > 0) {
			const done = task.subtasks.filter((s) => s.done).length;
			summaryLines.push(`  Progress: ${done}/${task.subtasks.length}`);
		}
		summaryLines.push('');
	}

	if (!noSave) {
		summaryLines.push(`Session saved. Resume with: /resume ${sessionId}`);
	}

	summaryLines.push('='.repeat(50));

	bus.emitAgent({
		type: 'thought',
		content: summaryLines.join('\n')
	});

	// Emit shutdown complete
	bus.emitAgent({
		type: 'shutdown_complete',
		summary
	});

	// Give UI time to render before exit
	await new Promise((resolve) => setTimeout(resolve, 100));

	bus.emitAgent({
		type: 'done',
		summary: 'Goodbye.'
	});
};
