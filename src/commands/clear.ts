import { bus } from '../core/bus.js';
import { llm } from '../core/llm.js';
import { CommandHandler } from '../core/commands.js';

export const clearCommand: CommandHandler = async (_args) => {
    // Clear UI history
    bus.emitAgent({
        type: 'clear_history'
    });

    // Clear LLM conversation history
    llm.clearHistory();

    // Small delay to ensure UI updates before showing "Done"
    await new Promise(resolve => setTimeout(resolve, 100));

    bus.emitAgent({
        type: 'done',
        summary: 'History and conversation cleared.'
    });
};
