import { bus } from '../core/bus.js';
import { CommandHandler } from '../core/commands.js';

export const settingsCommand: CommandHandler = async (_args) => {
	bus.emitAgent({
		type: 'view_request',
		viewId: 'settings',
		command: 'settings'
	});
};
