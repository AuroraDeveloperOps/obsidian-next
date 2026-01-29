import { bus } from '../core/bus.js';
import { commands } from '../core/commands.js';

export class Supervisor {
    constructor() {
        this.setupListeners();
    }

    private setupListeners() {
        bus.on('user', async (event) => {
            if (event.type === 'user_input') {
                await this.handleInput(event.content);
            }
        });
    }

    private async handleInput(input: string) {
        // 1. Check for Slash Commands
        if (input.startsWith('/')) {
            const [cmdName, ...args] = input.slice(1).split(' ');
            if (commands.has(cmdName)) {
                await commands.execute(cmdName, args);
                return;
            }
        }

        // 2. Default Agent Loop (Placeholder)
        bus.emitAgent({
            type: 'thought',
            content: 'Received input. Analyzing intent...'
        });

        // TODO: Connect to LLM (Claude) here
        bus.emitAgent({
            type: 'thought',
            content: 'LLM integration not yet connected.'
        });

        bus.emitAgent({
            type: 'done',
            summary: 'Processed input (No-op).'
        });
    }
}

export const supervisor = new Supervisor();
