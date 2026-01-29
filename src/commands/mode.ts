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
        bus.emitAgent({
            type: 'thought',
            content: `Current mode: ${current}\n\nAvailable modes:\n- auto: Execute without confirmation\n- plan: Think -> Approve -> Execute\n- safe: Auto reads, approve writes (default)`
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
}
