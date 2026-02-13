import { bus } from '../core/bus.js';
import { CommandHandler } from '../core/commands.js';

export const scheduledTasksCommand: CommandHandler = async (_args) => {
	bus.emitAgent({
		type: 'view_request',
		viewId: 'scheduled_tasks',
		command: 'scheduled_tasks'
	});
};
