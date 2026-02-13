import { bus } from '../core/bus.js';
import { CommandHandler } from '../core/commands.js';

/**
 * /ollama command - Opens the Ollama registry view
 */
export const ollamaCommand: CommandHandler = async (_args) => {
	bus.emitAgent({
		type: 'view_request',
		viewId: 'ollama',
		command: 'ollama'
	});
};
