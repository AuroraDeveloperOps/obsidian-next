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

        const statusLines = [
            '='.repeat(50),
            'SANDBOX EXECUTION MODE',
            '='.repeat(50),
            '',
            `Current Mode:    ${mode.toUpperCase()}`,
            `Runtime:         ${available ? 'Available' : 'Not installed'}`,
            '',
            'Modes:',
            '  local   - Direct execution with auditor checks',
            '  sandbox - OS-level isolation (filesystem/network)',
            '',
            'Usage:',
            '  /sandbox local   - Switch to local mode',
            '  /sandbox sandbox - Switch to sandbox mode',
            '  /sandbox config  - Show sandbox configuration',
            '',
            '='.repeat(50),
        ];

        bus.emitAgent({
            type: 'thought',
            content: statusLines.join('\n')
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
            summary: `Execution mode: ${subcommand.toUpperCase()}`
        });
        return;
    }

    // Show configuration
    if (subcommand === 'config') {
        const config = sandbox.getConfig();

        const configLines = [
            '='.repeat(50),
            'SANDBOX CONFIGURATION',
            '='.repeat(50),
            '',
            '[Network]',
            `  Allowed: ${config.allowedDomains.join(', ') || 'none'}`,
            `  Denied:  ${config.deniedDomains.join(', ') || 'none'}`,
            '',
            '[Filesystem]',
            `  Deny Read:   ${config.denyRead.join(', ') || 'none'}`,
            `  Allow Write: ${config.allowWrite.join(', ') || 'none'}`,
            `  Deny Write:  ${config.denyWrite.join(', ') || 'none'}`,
            '',
            '='.repeat(50),
        ];

        bus.emitAgent({
            type: 'thought',
            content: configLines.join('\n')
        });

        bus.emitAgent({
            type: 'done',
            summary: 'Sandbox config displayed'
        });
        return;
    }

    // Unknown subcommand
    bus.emitAgent({
        type: 'error',
        message: `Unknown sandbox command: ${subcommand}. Use: local, sandbox, or config`
    });
};
