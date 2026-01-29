import { bus } from '../core/bus.js';
import { CommandHandler } from '../core/commands.js';

export const clearCommand: CommandHandler = async (_args) => {
    bus.emitAgent({
        type: 'clear_history'
    });

    // Small delay to ensure UI updates before showing "Done"
    await new Promise(resolve => setTimeout(resolve, 100));

    bus.emitAgent({
        type: 'done',
        summary: 'History cleared.'
    });
};
