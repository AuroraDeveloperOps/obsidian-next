import { bus } from '../core/bus.js';
import { commands } from '../core/commands.js';
import { auditor } from '../core/auditor.js';
import { llm } from '../core/llm.js';

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
        bus.emitAgent({
            type: 'thought',
            content: `Received: "${input}"`
        });

        const audit = await auditor.checkCommand(input);
        if (!audit.approved) {
            bus.emitAgent({
                type: 'error',
                message: `Safety violation: ${audit.reason}`
            });
            return;
        }

        if (input.startsWith('/')) {
            const [cmdName, ...args] = input.slice(1).split(' ');
            if (commands.has(cmdName)) {
                await commands.execute(cmdName, args);
                return;
            }
            bus.emitAgent({
                type: 'error',
                message: `Unknown command: ${input}`
            });
            return;
        }

        bus.emitAgent({
            type: 'thought',
            content: 'Thinking...'
        });

        const response = await llm.streamChat(input);

        if (response) {
            bus.emitAgent({
                type: 'done',
                summary: 'Response complete'
            });
        } else {
            bus.emitAgent({
                type: 'error',
                message: 'Failed to get response from Claude'
            });
        }
    }
}

export const supervisor = new Supervisor();
