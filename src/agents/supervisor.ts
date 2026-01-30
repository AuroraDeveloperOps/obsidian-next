/**
 * Supervisor - Orchestrates user input to agent/commands
 */

import { bus } from '../core/bus.js';
import { commands } from '../core/commands.js';
import { agent } from '../core/agent.js';

export class Supervisor {
    constructor() {
        this.setupListeners();
    }

    private setupListeners() {
        bus.on('user', async (event) => {
            if (event.type === 'user_input') {
                await this.handleInput(event.content);
            }

            // Handle plan approval
            if (event.type === 'approval_response') {
                await agent.handleApprovalResponse(event.approved, event.requestId);
            }
        });
    }

    private async handleInput(input: string) {
        // Command handling
        if (input.startsWith('/')) {
            const [cmdName, ...args] = input.slice(1).split(' ');
            if (commands.has(cmdName)) {
                await commands.execute(cmdName, args);
                return;
            }
            bus.emitAgent({
                type: 'error',
                message: `Unknown command: /${cmdName}. Try /help`
            });
            return;
        }

        // Pass to agent
        await agent.run(input);
    }
}

export const supervisor = new Supervisor();
