/**
 * /mode command - Switch execution modes
 */

import { bus } from '../core/bus.js';
import { agent } from '../core/agent.js';

const MODES = ['auto', 'plan', 'safe'] as const;
type Mode = typeof MODES[number];

export async function modeCommand(args: string[]): Promise<void> {
    const mode = args[0]?.toLowerCase();

    if (!mode) {
        const current = agent.getMode();
        const content = [
            `Execution Mode: ${current}`,
            `   ⎿  auto    Execute without confirmation`,
            `   ⎿  plan    Think -> Approve -> Execute`,
            `   ⎿  safe    Auto reads, approve writes (default)`,
            '',
        ].join('\n');

        bus.emitAgent({
            type: 'thought',
            content
        });

        bus.emitAgent({
            type: 'done',
            summary: 'Mode settings displayed'
        });
        return;
    }

    if (!MODES.includes(mode as Mode)) {
        bus.emitAgent({
            type: 'error',
            message: `Invalid mode: ${mode}. Use: auto, plan, safe`
        });
        return;
    }

    await agent.setMode(mode as Mode);

    bus.emitAgent({
        type: 'done',
        summary: `Mode set to ${mode}`
    });
}
