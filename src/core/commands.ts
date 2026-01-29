import { bus } from './bus.js';
import { initCommand } from '../commands/init.js';

export type CommandHandler = (args: string[]) => Promise<void>;

interface CommandDef {
    name: string;
    description: string;
    handler: CommandHandler;
}

/**
 * CommandRegistry
 * Manages Slash Commands (e.g., /init, /usage)
 */
export class CommandRegistry {
    private commands: Map<string, CommandDef> = new Map();

    constructor() {
        // Register built-in help command
        this.register('help', 'Show available commands', async () => {
            const validCommands = Array.from(this.commands.values())
                .map(c => `  /${c.name.padEnd(10)} - ${c.description}`)
                .join('\n');

            bus.emitAgent({
                type: 'thought',
                content: `Available Commands:\n${validCommands}`
            });
        });

        // Register init command
        this.register('init', 'Initialize configuration', initCommand);
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
