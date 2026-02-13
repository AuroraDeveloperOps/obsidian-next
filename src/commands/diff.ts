import { bus } from '../core/bus.js';
import { CommandHandler } from '../core/commands.js';

export const diffCommand: CommandHandler = async (_args) => {
	bus.emitAgent({
		type: 'view_request',
		viewId: 'diff_list',
		command: 'diff'
	});
};
