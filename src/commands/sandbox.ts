import { bus } from '../core/bus.js';
import { sandbox } from '../core/sandbox.js';
import { CommandHandler } from '../core/commands.js';

/**
 * /sandbox command - Toggle and configure sandbox execution mode
 *
 * Usage:
 *   /sandbox         - Show current mode and status
 *   /sandbox local   - Switch to local execution (direct)
 *   /sandbox sandbox - Switch to sandboxed execution (isolated)
 *   /sandbox config  - Show current sandbox configuration
 */
export const sandboxCommand: CommandHandler = async (args) => {
    const subcommand = args[0]?.toLowerCase();

    // No arguments - show current status
    if (!subcommand) {
        const mode = sandbox.getMode();
        const available = await sandbox.isAvailable();

        const content = [
            `Sandbox Status: ${mode.toUpperCase()}`,
            `   ⎿  Runtime     ${available ? 'Available' : 'Not installed'}`,
            '',
            '   [Available Modes]',
            '   ⎿  local       Direct execution with audit checks',
            '   ⎿  sandbox     OS-level isolation (FS/Network)',
            '',
            '   [Usage]',
            '   ⎿  /sandbox local     Switch to local',
            '   ⎿  /sandbox sandbox   Switch to sandbox',
            '   ⎿  /sandbox config    View configuration',
            '',
        ].join('\n');

        bus.emitAgent({
            type: 'thought',
            content
        });

        bus.emitAgent({
            type: 'done',
            summary: 'Sandbox status displayed'
        });
        return;
    }

    // Switch mode
    if (subcommand === 'local' || subcommand === 'sandbox') {
        const available = await sandbox.isAvailable();

        if (subcommand === 'sandbox' && !available) {
            bus.emitAgent({
                type: 'error',
                message: 'Sandbox runtime not available. Install with: npm install @anthropic-ai/sandbox-runtime'
            });
            return;
        }

        await sandbox.setMode(subcommand);

        bus.emitAgent({
            type: 'done',
            summary: `Execution mode set to ${subcommand.toUpperCase()}`
        });
        return;
    }

    // Show configuration
    if (subcommand === 'config') {
        const cfg = sandbox.getConfig();

        const content = [
            'Sandbox Configuration',
            '',
            '   [Network Domains]',
            `   ⎿  Allowed     ${cfg.allowedDomains.join(', ') || 'none'}`,
            `   ⎿  Denied      ${cfg.deniedDomains.join(', ') || 'none'}`,
            '',
            '   [Filesystem]',
            `   ⎿  Deny Read   ${cfg.denyRead.join(', ') || 'none'}`,
            `   ⎿  Allow Write ${cfg.allowWrite.join(', ') || 'none'}`,
            `   ⎿  Deny Write  ${cfg.denyWrite.join(', ') || 'none'}`,
            '',
        ].join('\n');

        bus.emitAgent({
            type: 'thought',
            content
        });

        bus.emitAgent({
            type: 'done',
            summary: 'Sandbox configuration displayed'
        });
        return;
    }

    // Unknown subcommand
    bus.emitAgent({
        type: 'error',
        message: `Unknown sandbox command: ${subcommand}. Use: local, sandbox, or config`
    });
};
