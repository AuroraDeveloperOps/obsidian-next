
import { bus } from '../core/bus.js';
import { usage } from '../core/usage.js';
import { scheduler, Scheduler } from '../core/scheduler.js';

/**
 * Register system capabilities
 */
export function registerSystemAbilities(sched: Scheduler) {

    // Echo: Simple test function
    sched.registerAbility('system:echo', async (params) => {
        const message = params.message || 'Ping';
        bus.emitAgent({ type: 'thought', content: `[System Echo] ${message}` });
        // Also log to console for visibility
        console.log(`[Cron] ${message}`);
    });

    // Heartbeat: Liveness check
    sched.registerAbility('system:heartbeat', async () => {
        bus.emitAgent({
            type: 'thought',
            content: '[Heartbeat] Thump',
            hidden: true
        });
    });

    // Summary: Usage stats
    sched.registerAbility('system:summary', async () => {
        const stats = await usage.getStats();
        const cost = stats.totalCost.toFixed(4);
        bus.emitAgent({
            type: 'thought',
            content: `[Daily Summary] Total Cost: $${cost} | Requests: ${stats.totalRequests}`
        });
    });

    // Bash: Execute arbitrary shell commands
    sched.registerAbility('system:bash', async (params) => {
        const command = params.command;
        if (!command) throw new Error('Command parameter is required');

        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        try {
            const { stdout, stderr } = await execAsync(command);
            const output = stdout.trim() || stderr.trim();

            bus.emitAgent({
                type: 'thought',
                content: `[Cron Bash] ${command}\nOutput: ${output.slice(0, 200)}${output.length > 200 ? '...' : ''}`
            });
        } catch (error: any) {
            throw new Error(`Command failed: ${error.message}`);
        }
    });
}
