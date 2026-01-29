import { bus } from '../core/bus.js';
import { commands } from '../core/commands.js';
import { auditor } from '../core/auditor.js';

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
        // 0. Acknowledge Input immediately
        bus.emitAgent({
            type: 'thought',
            content: `Received input: "${input}"`
        });

        // 1. Audit the Input (Safety Check)
        const audit = await auditor.checkCommand(input);
        if (!audit.approved) {
            bus.emitAgent({
                type: 'error',
                message: `Safety Violation: ${audit.reason}`
            });
            return;
        }

        // 2. Check for Slash Commands
        if (input.startsWith('/')) {
            const [cmdName, ...args] = input.slice(1).split(' ');
            if (commands.has(cmdName)) {
                await commands.execute(cmdName, args);
                return;
            }
            // Unknown command fallback
            bus.emitAgent({
                type: 'error',
                message: `Unknown command: ${input}`
            });
            return;
        }

        // 3. Default Agent Loop (Placeholder)
        bus.emitAgent({
            type: 'thought',
            content: 'Analyzing intent...'
        });

        // TODO: Connect to LLM (Claude) here
        bus.emitAgent({
            type: 'thought',
            content: 'LLM integration not yet connected.'
        });

        bus.emitAgent({
            type: 'done',
            summary: 'Processing complete (No-op).'
        });
    }
}

export const supervisor = new Supervisor();
