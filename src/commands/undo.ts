/**
 * /undo command - Revert recent file changes
 */

import { bus } from '../core/bus.js';
import { undo } from '../core/undo.js';

export async function undoCommand(args: string[]): Promise<void> {
	const count = parseInt(args[0]) || 1;

	const history = undo.getHistory(10);

	if (args[0] === 'list' || args[0] === 'history') {
		if (history.length === 0) {
			bus.emitAgent({ type: 'thought', content: 'No changes to undo' });
			return;
		}

		const content = [
			'Recent Change History',
			...history.map((c, i) => {
				const op =
					c.operation === 'create' ? '+' : c.operation === 'delete' ? '-' : '~';
				return `   ⎿  [${op}] ${c.filePath}`;
			}),
			''
		].join('\n');

		bus.emitAgent({ type: 'thought', content });
		return;
	}

	const result = await undo.undo(count);

	if (result.success) {
		bus.emitAgent({ type: 'thought', content: result.message });
	} else {
		bus.emitAgent({ type: 'error', message: result.message });
	}
}
