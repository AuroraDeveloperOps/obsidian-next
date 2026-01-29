import { bus } from '../core/bus.js';
import { config } from '../core/config.js';
import { CommandHandler } from '../core/commands.js';

export const initCommand: CommandHandler = async (_args) => {
    bus.emitAgent({ type: 'thought', content: 'Checking configuration...' });

    if (await config.exists()) {
        bus.emitAgent({
            type: 'tool_result',
            tool: 'System',
            output: `Configuration already exists at ${config.getPath()}`
        });
        return;
    }

    bus.emitAgent({ type: 'thought', content: 'Creating default configuration...' });

    await config.save({
        model: 'claude-3-5-sonnet',
        maxTokens: 8192,
        language: 'en'
    });

    bus.emitAgent({
        type: 'tool_result',
        tool: 'System',
        output: `Initialized configuration at ${config.getPath()}`
    });
};
