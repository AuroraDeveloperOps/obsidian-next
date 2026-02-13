import { bus } from '../core/bus.js';
import { CommandHandler } from '../core/commands.js';

export const toolCommand: CommandHandler = async (_args) => {
	bus.emitAgent({
		type: 'view_request',
		viewId: 'tool_list',
		command: 'tool'
	});
};
