import { bus } from '../core/bus.js';
import { CommandHandler } from '../core/commands.js';

export const skillsCommand: CommandHandler = async (_args) => {
	bus.emitAgent({
		type: 'view_request',
		viewId: 'skills',
		command: 'skills'
	});
};
