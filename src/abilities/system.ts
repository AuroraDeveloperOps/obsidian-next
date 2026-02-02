
import { bus } from '../core/bus.js';
import { usage } from '../core/usage.js';
import { Scheduler } from '../core/scheduler.js';

/**
 * Register system capabilities
 */
export function registerSystemAbilities(sched: Scheduler) {

    // Echo: Simple test function
    sched.registerAbility('system:echo', async (params) => {
        const message = params.message || 'Ping';
        bus.emitAgent({ type: 'thought', content: `[Obsidian] Echo: ${message}` });
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
                content: `[Obsidian] Bash: ${command}\nOutput: ${output.slice(0, 200)}${output.length > 200 ? '...' : ''}`
            });
        } catch (error: any) {
            throw new Error(`Command failed: ${error.message}`);
        }
    });

    // Notify: Send a system notification, play a sound, and speak (macOS only)
    sched.registerAbility('system:notify', async (params) => {
        const title = params.title || 'Obsidian';
        const message = params.message || 'Scheduled Reminder';
        const sound = params.sound || 'Glass';
        const speak = params.speak !== false; // Default to true on macOS

        // Detailed Obsidian thought output
        bus.emitAgent({
            type: 'thought',
            content: `[Obsidian] Alert: "${message}" | Sound: ${sound} | Voice: ${speak ? 'Enabled' : 'Muted'}`
        });

        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        if (process.platform === 'darwin') {
            try {
                // 1. Terminal Bell (Immediate/Fallback)
                process.stdout.write('\x07');

                // 2. Audible Alert (Reliable afplay)
                await execAsync('afplay /System/Library/Sounds/Glass.aiff');

                // 3. Native macOS Notification
                const escapedMessage = message.replace(/"/g, '\\"');
                const escapedTitle = title.replace(/"/g, '\\"');
                const notifyCmd = `osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}" sound name "${sound}"'`;
                await execAsync(notifyCmd);

                // 4. Voice (TTS)
                if (speak) {
                    const safeMsg = message.replace(/["'$`\\]/g, "");
                    await execAsync(`say -v Daniel "${safeMsg}"`);
                }

                // 5. Extra alerts for critical items
                const lowerMsg = message.toLowerCase();
                if (lowerMsg.includes('trash') || lowerMsg.includes('remind') || lowerMsg.includes('urgent')) {
                    bus.emitAgent({ type: 'thought', content: `[Obsidian] High-priority reminder protocol initiated.` });
                    await execAsync('afplay /System/Library/Sounds/Submarine.aiff');
                    await execAsync('afplay /System/Library/Sounds/Submarine.aiff');
                }
            } catch (err) {
                console.error('macOS notification/voice failed:', err);
            }
        } else if (process.platform === 'linux') {
            try { await execAsync(`notify-send "${title}" "${message}"`); } catch { }
        }

        console.log(`\x07 [NOTIFICATION] ${title}: ${message}`);
    });
}
