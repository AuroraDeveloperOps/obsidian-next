import { bus } from '../core/bus.js';

export async function modeCommand(_args: string[]): Promise<void> {
	bus.emitAgent({
		type: 'view_request',
		viewId: 'mode_select',
		command: 'mode'
	});
}
