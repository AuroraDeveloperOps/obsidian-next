/**
 * /pilot command - Enable/disable Computer Use mode
 *
 * Activates the proper Anthropic Computer Use API with:
 * - Beta headers (computer-use-2025-01-24 / computer-use-2025-11-24)
 * - Anthropic-defined schema-less tools (computer, bash, text_editor)
 * - Coordinate scaling for high-resolution displays
 * - Enhanced system prompt for desktop automation
 *
 * Usage:
 *   /pilot on   - Enable computer use mode
 *   /pilot off  - Disable computer use mode
 *   /pilot      - Show current status
 */

import { bus } from '../core/bus.js';
import { llm } from '../core/llm.js';
import { checkDependencies, isComputerUseAvailable } from '../computer/index.js';

export async function pilotCommand(args: string[]): Promise<void> {
    const action = args[0]?.toLowerCase();

    // Check platform support
    if (!isComputerUseAvailable()) {
        bus.emitAgent({
            type: 'error',
            message: 'Computer Use is only available on macOS. Linux/Windows support coming soon.'
        });
        return;
    }

    // Show status
    if (!action) {
        const isEnabled = llm.isComputerUseEnabled();
        const deps = await checkDependencies();

        const status = [
            `Computer Use (Pilot Mode): ${isEnabled ? 'ENABLED' : 'DISABLED'}`,
            '',
            'Dependencies:',
            deps.available
                ? '  [OK] All dependencies installed'
                : deps.missing.map(m => `  [MISSING] ${m}`).join('\n'),
            '',
            'Commands:',
            '  /pilot on   - Enable computer use with proper Anthropic API',
            '  /pilot off  - Disable computer use',
            '',
            'Features when enabled:',
            '  - Beta API: computer-use-2025-01-24 (or 2025-11-24 for Opus 4.5)',
            '  - Schema-less Anthropic-defined tools',
            '  - Automatic coordinate scaling for high-res displays',
            '  - Screenshot capture, mouse/keyboard control',
            '  - Zoom action (Opus 4.5 only)',
            ''
        ].join('\n');

        bus.emitAgent({
            type: 'thought',
            content: status
        });

        bus.emitAgent({
            type: 'done',
            summary: 'Pilot mode status displayed'
        });
        return;
    }

    // Enable
    if (action === 'on' || action === 'enable') {
        // Check dependencies first
        const deps = await checkDependencies();
        if (!deps.available) {
            bus.emitAgent({
                type: 'error',
                message: `Missing dependencies:\n${deps.missing.map(m => `  - ${m}`).join('\n')}`
            });
            return;
        }

        await llm.enableComputerUse();

        bus.emitAgent({
            type: 'done',
            summary: 'Computer Use enabled. You now have full desktop control.'
        });
        return;
    }

    // Disable
    if (action === 'off' || action === 'disable') {
        llm.disableComputerUse();

        bus.emitAgent({
            type: 'done',
            summary: 'Computer Use disabled.'
        });
        return;
    }

    // Invalid action
    bus.emitAgent({
        type: 'error',
        message: `Invalid action: ${action}. Use: on, off`
    });
}
