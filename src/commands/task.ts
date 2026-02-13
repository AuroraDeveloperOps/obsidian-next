import { bus } from '../core/bus.js';

export async function taskCommand(_args: string[]): Promise<void> {
	bus.emitAgent({
		type: 'view_request',
		viewId: 'task',
		command: 'task'
	});
}
