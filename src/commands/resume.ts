import { bus } from '../core/bus.js';
import { session } from '../core/session.js';

export async function resumeCommand(args: string[]): Promise<void> {
	if (args.length > 0) {
		const sessionId = args[0];
		try {
			const result = await session.restore(sessionId);
			if (result.success) {
				bus.emitAgent({
					type: 'thought',
					content: `Resumed session: ${sessionId}`
				});
			} else {
				bus.emitAgent({
					type: 'error',
					message: `Failed to resume session: ${result.error}`
				});
			}
		} catch (err) {
			bus.emitAgent({
				type: 'error',
				message: `Error resuming session: ${err}`
			});
		}
		return;
	}

	bus.emitAgent({
		type: 'view_request',
		viewId: 'sessions',
		command: 'resume'
	});
}
