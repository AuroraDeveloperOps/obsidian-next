import { bus } from '../core/bus.js';
import { config } from '../core/config.js';
import { usage } from '../core/usage.js';
import { tools } from '../core/tools.js';
import { CommandHandler } from '../core/commands.js';
import os from 'os';
import path from 'path';

/**
 * /status command - Display system and session status
 */
export const statusCommand: CommandHandler = async (_args) => {
    const cfg = await config.load();
    const stats = usage.getStats();

    // System info
    const platform = `${os.type()} ${os.release()}`;
    const nodeVersion = process.version;
    const workspace = process.cwd();
    const workspaceName = path.basename(workspace);

    // Session info
    const sessionCost = usage.getSessionCost();
    const toolList = (await tools.list()).map(t => t.name).join(', ');

    // Build status display
    const statusLines = [
        `System Status: ${workspaceName}`,
        `   ⎿  Platform    ${platform}`,
        `   ⎿  Runtime     Node.js ${nodeVersion}`,
        '',
        '   [Configuration]',
        `   ⎿  Model       ${cfg.model || 'claude-sonnet-4-5'}`,
        `   ⎿  Tokens      Max ${cfg.maxTokens || 8192}`,
        `   ⎿  API Key     ${cfg.apiKey ? 'OK (Set)' : 'MISSING'}`,
        '',
        '   [Session Usage]',
        `   ⎿  Cost        $${sessionCost.toFixed(4)}`,
        `   ⎿  Input       ${stats.totalInputTokens.toLocaleString()} tokens`,
        `   ⎿  Output      ${stats.totalOutputTokens.toLocaleString()} tokens`,
        '',
        '   [Capabilities]',
        `   ⎿  Tools       ${(await tools.list()).length} registered`,
        '',
    ];

    bus.emitAgent({
        type: 'thought',
        content: statusLines.join('\n')
    });

    bus.emitAgent({
        type: 'done',
        summary: 'Status displayed'
    });
};
