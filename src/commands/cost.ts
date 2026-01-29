import { bus } from '../core/bus.js';
import { CommandHandler } from '../core/commands.js';
import { usage } from '../core/usage.js';

export const costCommand: CommandHandler = async (_args) => {
    await usage.init();
    const stats = usage.getStats();

    bus.emitAgent({
        type: 'tool_result',
        tool: 'Cost Tracker',
        output: `Session Cost Report:
  Input tokens:  ${stats.totalInputTokens.toLocaleString()}
  Output tokens: ${stats.totalOutputTokens.toLocaleString()}
  Total cost:    $${stats.totalCost.toFixed(4)}`
    });
};
