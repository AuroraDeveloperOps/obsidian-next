import { bus } from '../core/bus.js';

export async function undoCommand(_args: string[]): Promise<void> {
	bus.emitAgent({
		type: 'view_request',
		viewId: 'undo',
		command: 'undo'
	});
}
