import { bus } from '../core/bus.js';

export async function resumeCommand(_args: string[]): Promise<void> {
	bus.emitAgent({
		type: 'view_request',
		viewId: 'sessions',
		command: 'resume'
	});
}
