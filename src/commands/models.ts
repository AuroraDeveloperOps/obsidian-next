import { bus } from '../core/bus.js';
import { config } from '../core/config.js';
import { CommandHandler } from '../core/commands.js';

export const modelsCommand: CommandHandler = async (args) => {
    const currentConfig = await config.load();

    const CLAUDE_4_MODELS = [
        { id: 'claude-opus-4-6-20260207', label: 'Opus 4.6 (Intelligence King)' },
        { id: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5 (Balanced)' },
        { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (Fast)' },
        { id: 'claude-opus-4-5-20251101', label: 'Opus 4.5 (Legacy Pro)' },
    ];

    if (args.length === 0) {
        const content = [
            'Available Claude 4 Family Models',
            ...CLAUDE_4_MODELS.map((m, i) => `   ⎿  ${i + 1}. ${m.label.padEnd(30)} ${currentConfig.model === m.id ? '[Current]' : ''}`),
            '',
            '   [Usage]',
            '   ⎿  /models <1-4|name>  Set model',
            '',
        ].join('\n');

        bus.emitAgent({
            type: 'thought',
            content
        });

        bus.emitAgent({
            type: 'done',
            summary: 'Model selection menu displayed'
        });
        return;
    }

    const selection = args[0].toLowerCase();
    let newModel: string | undefined;

    // Strict Selection Logic
    if (selection === '1' || selection === 'opus-4.6') {
        newModel = 'claude-opus-4-6-20260207';
    } else if (selection === '2' || selection === 'opus-4.5') {
        newModel = 'claude-opus-4-5-20251101';
    } else if (selection === '3' || selection === 'sonnet') {
        newModel = 'claude-sonnet-4-5-20250929';
    } else if (selection === '4' || selection === 'haiku') {
        newModel = 'claude-haiku-4-5-20251001';
    }

    if (!newModel) {
        bus.emitAgent({
            type: 'error',
            message: `Invalid selection: ${selection}. Choose from the Claude 4 family (1-4).`
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
