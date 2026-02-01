import { bus } from '../src/core/bus.js';
import { llm } from '../src/core/llm.js';

async function test() {
    process.stderr.write('--- Start Interrupt Test ---\n');

    // Subscribe to bus events
    bus.on('agent', (e) => {
        if (e.type === 'thought') {
            process.stderr.write(`[Agent Thought] ${e.content}\n`);
        }
    });

    // Start a message that we know will take some time (streaming)
    const chatPromise = llm.streamChat('Write a short poem about coding.');

    // Wait a bit and then trigger interrupt
    setTimeout(() => {
        process.stderr.write('Simulating Escape (user_interrupt)...\n');
        bus.emitUser({ type: 'user_interrupt' });
    }, 500);

    try {
        const result = await chatPromise;
        process.stderr.write(`Result: ${result ? 'SUCCESS (not interrupted)' : 'NOTHING (interrupted correctly)'}\n`);

        if (result === null) {
            process.stderr.write('[PASS] SUCCESS: Agent was interrupted.\n');
        } else {
            process.stderr.write('[FAIL] FAILURE: Agent was NOT interrupted.\n');
        }
    } catch (e: any) {
        process.stderr.write(`Caught error: ${e.message}\n`);
    }

    process.exit(0);
}

test().catch(err => {
    process.stderr.write(`Test failed: ${err.message}\n`);
    process.exit(1);
});
