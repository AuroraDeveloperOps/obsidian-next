import { bus } from './bus.js';
import { initCommand } from '../commands/init.js';
import { clearCommand } from '../commands/clear.js';
import { costCommand } from '../commands/cost.js';
import { usageCommand } from '../commands/usage.js';
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
}

export class CommandRegistry {
    private commands: Map<string, CommandDef> = new Map();

    constructor() {
        this.register('help', 'Show available commands', async () => {
            const validCommands = Array.from(this.commands.values())
                .map(c => `  /${c.name.padEnd(10)} - ${c.description}`)
                .join('\n');

            bus.emitAgent({
                type: 'thought',
                content: `Available Commands:\n${validCommands}`
            });
        });

        this.register('init', 'Initialize configuration', initCommand);
        this.register('clear', 'Clear conversation history', clearCommand);
        this.register('cost', 'Show session cost', costCommand);
        this.register('usage', 'Show historical usage', usageCommand);
        this.register('models', 'Select AI model', modelsCommand);
        this.register('tool', 'Execute tools manually', toolCommand);
        this.register('status', 'Show system status', statusCommand);
        this.register('sandbox', 'Toggle sandbox mode', sandboxCommand);
        this.register('mode', 'Set execution mode (auto/plan/safe)', modeCommand);
        this.register('task', 'View/manage current task', taskCommand);
        this.register('undo', 'Undo recent file changes', undoCommand);
        this.register('config', 'View/edit configuration', configCommand);
        this.register('doctor', 'Run system diagnostics', doctorCommand);
        this.register('settings', 'View/edit settings (mode, permissions, ui)', settingsCommand);
        this.register('exit', 'Save session and exit gracefully', exitCommand);
        this.register('resume', 'Restore a saved session', resumeCommand);
        this.register('diff', 'View recent file changes', diffCommand);
    }

    register(name: string, description: string, handler: CommandHandler) {
        this.commands.set(name, { name, description, handler });
    }

    has(name: string): boolean {
        return this.commands.has(name);
    }

    async execute(name: string, args: string[]) {
        const cmd = this.commands.get(name);
        if (!cmd) {
            bus.emitAgent({
                type: 'error',
                message: `Unknown command: /${name}`
            });
            return;
        }

        try {
            await cmd.handler(args);
        } catch (error) {
            bus.emitAgent({
                type: 'error',
                message: `Command /${name} failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }
}

export const commands = new CommandRegistry();
