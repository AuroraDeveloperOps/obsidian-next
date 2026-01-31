import { SandboxExecutor } from '../src/core/sandbox.ts';
import { bus } from '../src/core/bus.ts';

// Setup bus listener to see thoughts
(bus as any).on('agent', (event: any) => {
    if (event.type === 'thought' || event.type === 'error') {
        console.log(`[EVENT] ${event.type.toUpperCase()}: ${event.content || event.message}`);
    }
});

async function test() {
    console.log('--- Sandbox Manual Verification ---');
    const sandbox = new SandboxExecutor();

    // Force sandbox mode
    await (sandbox as any).setMode('sandbox');

    const command = 'echo "Hello from $(whoami)"';
    console.log(`Original command: ${command}`);

    try {
        const wrapped = await sandbox.wrapCommand(command);
        console.log(`Wrapped command: ${wrapped}`);

        console.log('\nExecuting wrapped command...');
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const { stdout, stderr } = await execAsync(wrapped);
        console.log(`STDOUT: ${stdout.trim()}`);
        if (stderr) console.log(`STDERR: ${stderr.trim()}`);

    } catch (error: any) {
        console.error(`Execution failed: ${error.message}`);
    }
}

test();
