import { bus } from './bus.js';
import { initCommand } from '../commands/init.js';
import { clearCommand } from '../commands/clear.js';
import { costCommand } from '../commands/cost.js';
import { usageCommand } from '../commands/usage.js';
import { modelsCommand } from '../commands/models.js';
import { toolCommand } from '../commands/tool.js';
import { statusCommand } from '../commands/status.js';

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
