import { bus } from './bus.js';
import { initCommand } from '../commands/init.js';
import { clearCommand } from '../commands/clear.js';
import { contextCommand } from '../commands/context.js';
import { modelsCommand } from '../commands/models.js';
import { toolCommand } from '../commands/tool.js';
import { statusCommand } from '../commands/status.js';
import { sandboxCommand } from '../commands/sandbox.js';
import { modeCommand } from '../commands/mode.js';
import { taskCommand } from '../commands/task.js';
import { undoCommand } from '../commands/undo.js';
import { configCommand } from '../commands/config.js';
import { doctorCommand } from '../commands/doctor.js';
import { settingsCommand } from '../commands/settings.js';
import { exitCommand } from '../commands/exit.js';
import { resumeCommand } from '../commands/resume.js';
import { diffCommand } from '../commands/diff.js';

export type CommandHandler = (args: string[]) => Promise<void>;

interface CommandDef {
    name: string;
    description: string;
    handler: CommandHandler;
    isView?: boolean;
    viewId?: string;
    aliases?: string[];
}

export class CommandRegistry {
    private commands: Map<string, CommandDef> = new Map();
    private aliases: Map<string, string> = new Map();

    constructor() {
        this.register('help', 'Show available commands', async () => {
            const validCommands = Array.from(this.commands.values())
                .map(c => `  /${c.name.padEnd(10)} - ${c.description}`)
                .join('\n');

            bus.emitAgent({
                type: 'thought',
                content: `Available Commands:\n${validCommands}`
            });
        }, { isView: true, viewId: 'help' });

        this.register('init', 'Initialize configuration', initCommand);
        this.register('clear', 'Clear conversation history', clearCommand);
        this.register('context', 'Show session context & usage', contextCommand, { isView: true, viewId: 'usage', aliases: ['usage', 'cost'] });
        this.register('models', 'Select AI model', modelsCommand, { isView: true, viewId: 'settings' });
        this.register('tool', 'Execute tools manually', toolCommand);
        this.register('status', 'Show system status', statusCommand, { isView: true, viewId: 'doctor', aliases: ['doctor'] });
        this.register('sandbox', 'Toggle sandbox mode', sandboxCommand, { isView: true, viewId: 'settings' }); // Root.tsx handles the specific tab
        this.register('mode', 'Set execution mode (auto/plan/safe)', modeCommand, { isView: true, viewId: 'settings' });
        this.register('task', 'View/manage current task', taskCommand, { isView: true, viewId: 'task' });
        this.register('undo', 'Undo recent file changes', undoCommand);
        this.register('config', 'View/edit configuration', configCommand, { isView: true, viewId: 'settings' });
        this.register('settings', 'View/edit settings (mode, permissions, ui)', settingsCommand, { isView: true, viewId: 'settings' });
        this.register('exit', 'Save session and exit gracefully', exitCommand);
        this.register('resume', 'Restore a saved session', resumeCommand, { isView: true, viewId: 'sessions', aliases: ['sessions'] });
        this.register('diff', 'View recent file changes', diffCommand);
        this.register('mcp', 'Manage Model Context Protocol', async (args) => {
            // Placeholder if needed, but UI usually handles it
        }, { isView: true, viewId: 'mcp', aliases: ['plugin'] });

        this.register('schedule_test', 'Schedule a test task', async () => {
            const { scheduler } = await import('./scheduler.js');
            const now = new Date();
            now.setSeconds(now.getSeconds() + 5);
            const cronExpression = `${now.getSeconds()} ${now.getMinutes()} ${now.getHours()} ${now.getDate()} ${now.getMonth() + 1} *`;

            await scheduler.scheduleTask(cronExpression, 'system:echo', { message: 'Hello from scheduled task' });
            bus.emitAgent({
                type: 'thought',
                content: `Scheduled a test task to run at ${now.toLocaleTimeString()}`
            });
        });
    }

    register(name: string, description: string, handler: CommandHandler, options: Partial<Pick<CommandDef, 'isView' | 'viewId' | 'aliases'>> = {}) {
        const def = { name, description, handler, ...options };
        this.commands.set(name, def);

        if (options.aliases) {
            for (const alias of options.aliases) {
                this.aliases.set(alias, name);
            }
        }
    }

    has(name: string): boolean {
        return this.commands.has(name) || this.aliases.has(name);
    }

    async execute(name: string, args: string[]) {
        const actualName = this.aliases.get(name) || name;
        const cmd = this.commands.get(actualName);
        if (!cmd) {
            bus.emitAgent({
                type: 'error',
                message: `Unknown command: /${name}`
            });
            return;
        }

        try {
            // Signal UI if this is a view command
            if (cmd.isView && cmd.viewId) {
                bus.emitAgent({
                    type: 'view_request',
                    viewId: cmd.viewId,
                    command: actualName,
                    params: args
                });
            }

            await cmd.handler(args);

            // Emit command executed event for UI/logging
            bus.emitAgent({
                type: 'command_executed',
                command: actualName,
                args: args
            });
        } catch (error) {
            bus.emitAgent({
                type: 'error',
                message: `Command /${name} failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }
}

export const commands = new CommandRegistry();
