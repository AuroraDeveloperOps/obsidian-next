import { bus } from '../core/bus.js';
import { CommandHandler } from '../core/commands.js';
import { usage } from '../core/usage.js';

export const usageCommand: CommandHandler = async (_args) => {
    await usage.init();
    const stats = usage.getStats();

    bus.emitAgent({
        type: 'tool_result',
        tool: 'Usage Tracker',
        output: `Historical Usage Report:
  Total sessions:    ${stats.totalSessions}
  Total messages:    ${stats.totalRequests}
  Total tokens:      ${(stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()}
  Total cost:        $${stats.totalCost.toFixed(4)}`
    });
};
