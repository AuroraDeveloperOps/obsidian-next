/**
 * /task command - View and manage current task
 */

import { bus } from '../core/bus.js';
import { tasks } from '../core/tasks.js';

export async function taskCommand(args: string[]): Promise<void> {
	await tasks.init();

	const subcommand = args[0]?.toLowerCase();

	if (!subcommand || subcommand === 'show') {
		const task = tasks.get();
		if (!task) {
			bus.emitAgent({ type: 'thought', content: 'No active task' });
			return;
		}

		const content = [
			`Current Task: ${task.title}`,
			`   ⎿  Status      ${task.status}`,
			'',
			'   [Progress]',
			...task.subtasks.map(
				(st, i) => `   ⎿  ${st.done ? '✔' : '☐'} ${st.text}`
			),
			''
		];

		if (task.context.length > 0) {
			content.push('   [Context]');
			task.context.forEach((c) => content.push(`   ⎿  ${c}`));
			content.push('');
		}

		bus.emitAgent({ type: 'thought', content: content.join('\n') });
		return;
	}

	if (subcommand === 'new') {
		const title = args.slice(1).join(' ');
		if (!title) {
			bus.emitAgent({ type: 'error', message: 'Usage: /task new <title>' });
			return;
		}
		await tasks.create(title);
		bus.emitAgent({ type: 'thought', content: `Task created: ${title}` });
		return;
	}

	if (subcommand === 'add') {
		const text = args.slice(1).join(' ');
		if (!text) {
			bus.emitAgent({ type: 'error', message: 'Usage: /task add <subtask>' });
			return;
		}
		await tasks.addSubtask(text);
		bus.emitAgent({ type: 'thought', content: `Added: ${text}` });
		return;
	}

	if (subcommand === 'done') {
		const index = parseInt(args[1]);
		if (isNaN(index)) {
			// Mark whole task done
			await tasks.complete();
			bus.emitAgent({ type: 'thought', content: 'Task completed' });
		} else {
			await tasks.completeSubtask(index - 1);
			bus.emitAgent({ type: 'thought', content: `Subtask ${index} done` });
		}
		return;
	}

	if (subcommand === 'clear') {
		await tasks.clear();
		bus.emitAgent({ type: 'thought', content: 'Task cleared' });
		return;
	}

	bus.emitAgent({
		type: 'thought',
		content: `Usage:
  /task           - Show current task
  /task new <t>   - Create new task
  /task add <st>  - Add subtask
  /task done [n]  - Complete task or subtask n
  /task clear     - Clear task`
	});
}
