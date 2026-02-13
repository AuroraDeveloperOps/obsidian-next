import { bus } from '../core/bus.js';

export async function doctorCommand(_args: string[]): Promise<void> {
	bus.emitAgent({
		type: 'view_request',
		viewId: 'doctor',
		command: 'doctor'
	});
}
