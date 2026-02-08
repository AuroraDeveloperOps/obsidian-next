
import { bus } from '../core/bus.js';
import { usage } from '../core/usage.js';
import { config } from '../core/config.js';
import { Scheduler } from '../core/scheduler.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Register system capabilities
 */
export function registerSystemAbilities(sched: Scheduler) {

    // Audit: Proactive security scan
    sched.registerAbility('system:audit', async () => {
        const cfg = await config.load();
        const sensitivePatterns = ['.env', '*.key', '*.pem', 'id_rsa'];
        
        bus.emitAgent({ type: 'thought', content: '[Audit] Starting proactive security scan...' });

        try {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            // Simple search for sensitive files
            const found = [];
            for (const pattern of sensitivePatterns) {
                try {
                    const { stdout } = await execAsync(`find ${cfg.workspaceRoot} -name "${pattern}" -not -path "*/node_modules/*"`);
                    if (stdout.trim()) found.push(...stdout.trim().split('\n'));
                } catch { }
            }

            if (found.length > 0) {
                bus.emitAgent({
                    type: 'thought',
                    content: `[Audit] Found ${found.length} potentially sensitive files:\n${found.slice(0, 5).join('\n')}`
                });
            } else {
                bus.emitAgent({ type: 'thought', content: '[Audit] No immediate security risks found in workspace root.' });
            }
        } catch (e) {
            console.error('[Audit] Failed:', e);
        }
    });

    // Index: Proactive codebase mapping
    sched.registerAbility('system:index', async () => {
        const cfg = await config.load();
        const mapPath = path.join(cfg.workspaceRoot, 'MAP.md');

        bus.emitAgent({ type: 'thought', content: '[Index] Updating codebase map (MAP.md)...' });

        try {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            const { stdout } = await execAsync(`find ${cfg.workspaceRoot} -maxdepth 2 -not -path '*/.*'`);
            const structure = stdout.trim();

            const markdown = `# Codebase Map\n\nGenerated on: ${new Date().toLocaleString()}\n\n\`\`\`\n${structure}\n\`\`\``;
            await fs.writeFile(mapPath, markdown);

            bus.emitAgent({ type: 'thought', content: `[Index] MAP.md updated successfully at ${mapPath}` });
        } catch (e) {
            console.error('[Index] Failed:', e);
        }
    });

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
