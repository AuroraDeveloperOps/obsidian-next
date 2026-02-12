import { bus } from '../core/bus.js';
import { scheduler } from '../core/scheduler.js';
import { CommandHandler } from '../core/commands.js';

export const scheduleCommand: CommandHandler = async (args) => {
	if (args.length < 2) {
		bus.emitAgent({
			type: 'thought',
			content: `Usage: /schedule "<cron>" <ability> [params_json]\nExample: /schedule "0 * * * *" system:echo '{"message": "Hourly heartbeat"}'`
		});
		return;
	}

	const cron = args[0];
	const ability = args[1];
	const paramsStr = args.slice(2).join(' ') || '{}';

	try {
		let params = {};
		if (paramsStr) {
			params = JSON.parse(paramsStr);
		}

		const task = await scheduler.scheduleTask(cron, ability, params);
		bus.emitAgent({
			type: 'thought',
			content: `Successfully scheduled task ${task.id} (${ability}) with schedule: ${cron}`
		});
	} catch (error: any) {
		bus.emitAgent({
			type: 'error',
			message: `Failed to schedule task: ${error.message}`
		});
	}
};
