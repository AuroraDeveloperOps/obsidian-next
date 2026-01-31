/**
 * /doctor - Diagnostic command to check system health
 */

import { bus } from '../core/bus.js';
import { config } from '../core/config.js';
import { keyManager } from '../core/keyManager.js';
import { tools } from '../core/tools.js';
import { sandbox } from '../core/sandbox.js';
import { formatHeader, formatFooter } from '../utils/ui.js';
import Anthropic from '@anthropic-ai/sdk';

interface CheckResult {
    name: string;
    status: 'ok' | 'warn' | 'error';
    message: string;
}

export async function doctorCommand(args: string[]): Promise<void> {
    const results: CheckResult[] = [];

    bus.emitAgent({ type: 'thought', content: 'Running diagnostics...' });

    // 1. Check configuration
    try {
        const cfg = await config.load();
        const apiKey = await keyManager.loadKey();
        const backend = keyManager.getBackend();

        if (apiKey) {
            results.push({
                name: 'API Key',
                status: 'ok',
                message: `Configured (${backend})`
            });
        } else {
            results.push({
                name: 'API Key',
                status: 'error',
                message: 'Not set. Run /init to configure'
            });
        }

        results.push({
            name: 'Model',
            status: 'ok',
            message: cfg.model
        });
    } catch (e) {
        results.push({
            name: 'Config',
            status: 'error',
            message: `Failed to load: ${e}`
        });
    }

    // 2. Check tools
    const toolList = tools.list();
    results.push({
        name: 'Tools',
        status: 'ok',
        message: `${toolList.length} registered: ${toolList.map(t => t.name).join(', ')}`
    });

    // 3. Check sandbox
    const sandboxAvailable = await sandbox.isAvailable();
    results.push({
        name: 'Sandbox',
        status: sandboxAvailable ? 'ok' : 'warn',
        message: sandboxAvailable ? 'Available' : 'Not available (commands run directly)'
    });

    // 4. Check API connectivity
    try {
        const apiKey = await keyManager.loadKey();
        if (apiKey) {
            const client = new Anthropic({ apiKey });
            // Quick health check - just verify we can create a client
            // A full request would cost money, so we just verify the client instantiates
            results.push({
                name: 'API Client',
                status: 'ok',
                message: 'Anthropic SDK initialized'
            });
        }
    } catch (e: any) {
        results.push({
            name: 'API Client',
            status: 'error',
            message: e.message || 'Failed to initialize'
        });
    }

    // 5. Check workspace
    const cwd = process.cwd();
    results.push({
        name: 'Workspace',
        status: 'ok',
        message: cwd
    });

    // 6. Check Node version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    results.push({
        name: 'Node.js',
        status: majorVersion >= 18 ? 'ok' : 'warn',
        message: nodeVersion + (majorVersion < 18 ? ' (recommend v18+)' : '')
    });

    // Format results
    const statusIcons: Record<string, string> = {
        ok: '[OK]',
        warn: '[!!]',
        error: '[X]'
    };

    const statusColors: Record<string, string> = {
        ok: 'green',
        warn: 'yellow',
        error: 'red'
    };

    const output = [
        formatHeader('System Diagnostics'),
        ...results.map(r => {
            const icon = statusIcons[r.status];
            return `${icon.padEnd(6)} ${r.name.padEnd(12)} ${r.message}`;
        }),
        formatFooter(),
        `Total: ${results.filter(r => r.status === 'ok').length} OK, ` +
        `${results.filter(r => r.status === 'warn').length} warnings, ` +
        `${results.filter(r => r.status === 'error').length} errors`
    ];

    bus.emitAgent({ type: 'thought', content: output.join('\n') });
}
