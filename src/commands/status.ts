import { bus } from '../core/bus.js';
import { CommandHandler } from '../core/commands.js';

/**
 * /status command - Opens StatusView overlay
 */
export const statusCommand: CommandHandler = async (_args) => {
	bus.emitAgent({
		type: 'view_request',
		viewId: 'status',
		command: 'status'
	});
};
