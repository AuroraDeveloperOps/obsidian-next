import { bus } from '../core/bus.js';
import { config } from '../core/config.js';
import { CommandHandler } from '../core/commands.js';

export const modelsCommand: CommandHandler = async (args) => {
    const currentConfig = await config.load();

    if (args.length === 0) {
        bus.emitAgent({
            type: 'tool_result',
            tool: 'Model Selector',
            output: `Available AI Models:
  1. claude-sonnet-4-5    [Current/Default]
  2. claude-opus-4-5      [Powerful]
  3. claude-haiku-4-5     [Fast/Cheap]
  4. ollama               [Local]

Current model: ${currentConfig.model}

Usage: /models <number> to select a model`
        });
        return;
    }

    const selection = args[0];
    let newModel: string;

    switch (selection) {
        case '1':
        case 'sonnet':
        case 'claude-sonnet-4-5':
            newModel = 'claude-sonnet-4-5-20250929';
            break;
        case '2':
        case 'opus':
        case 'claude-opus-4-5':
            newModel = 'claude-opus-4-5-20251101';
            break;
        case '3':
        case 'haiku':
        case 'claude-haiku-4-5':
            newModel = 'claude-haiku-4-5-20251001';
            break;
        case '4':
        case 'ollama':
            newModel = 'ollama';
            break;
        default:
            bus.emitAgent({
                type: 'error',
                message: `Invalid model selection: ${selection}. Use /models to see available options.`
            });
            return;
    }

    await config.save({
        ...currentConfig,
        model: newModel
    });

    bus.emitAgent({
        type: 'done',
        summary: `Model switched to ${newModel}`
    });
};
