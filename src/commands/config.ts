/**
 * /config - Interactive configuration editor
 */

import { bus } from '../core/bus.js';
import { config } from '../core/config.js';

export async function configCommand(args: string[]): Promise<void> {
    const subcommand = args[0];
    const cfg = await config.load();

    if (!subcommand) {
        // Show current config
        const display = [
            'Current Configuration:',
            '='.repeat(40),
            `  model:      ${cfg.model}`,
            `  maxTokens:  ${cfg.maxTokens}`,
            `  apiKey:     ${cfg.apiKey ? '***' + cfg.apiKey.slice(-4) : 'not set'}`,
            '',
            'Usage:',
            '  /config set <key> <value>',
            '  /config reset',
            '',
            'Keys: model, maxTokens',
        ];
        bus.emitAgent({ type: 'thought', content: display.join('\n') });
        return;
    }

    if (subcommand === 'set') {
        const key = args[1];
        const value = args.slice(2).join(' ');

        if (!key || !value) {
            bus.emitAgent({ type: 'error', message: 'Usage: /config set <key> <value>' });
            return;
        }

        // Validate keys
        const validKeys = ['model', 'maxTokens'];
        if (!validKeys.includes(key)) {
            bus.emitAgent({ type: 'error', message: `Invalid key. Valid keys: ${validKeys.join(', ')}` });
            return;
        }

        // Update config
        const updates: Record<string, any> = {};
        if (key === 'maxTokens') {
            const num = parseInt(value);
            if (isNaN(num) || num < 100 || num > 200000) {
                bus.emitAgent({ type: 'error', message: 'maxTokens must be between 100 and 200000' });
                return;
            }
            updates.maxTokens = num;
        } else {
            updates[key] = value;
        }

        await config.save(updates);
        bus.emitAgent({ type: 'thought', content: `Config updated: ${key} = ${value}` });
        return;
    }

    if (subcommand === 'reset') {
        await config.save({
            model: 'claude-sonnet-4-5-20250929',
            maxTokens: 8192,
        });
        bus.emitAgent({ type: 'thought', content: 'Config reset to defaults' });
        return;
    }

    bus.emitAgent({ type: 'error', message: `Unknown subcommand: ${subcommand}` });
}
