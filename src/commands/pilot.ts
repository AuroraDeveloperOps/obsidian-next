import { bus } from '../core/bus.js';

export async function pilotCommand(_args: string[]): Promise<void> {
	bus.emitAgent({
		type: 'view_request',
		viewId: 'pilot',
		command: 'pilot'
	});
}
