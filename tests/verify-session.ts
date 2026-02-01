import { context } from '../src/core/context.js';
import fs from 'fs/promises';
import path from 'path';

async function verify() {
    console.log('Testing Session Rotation...');

    // 1. Setup: Inject stale state
    await context.init();
    await context.setTask('STALE TASK FROM YESTERDAY');
    console.log('Set stale task:', context.getCurrentTask());

    // 2. Simulate new run (Trigger startNewSession)
    await context.startNewSession();

    // 3. Verify
    const newTask = context.getCurrentTask();
    console.log('New task (should be null):', newTask);

    if (newTask === null) {
        console.log('✅ Session rotated successfully.');
    } else {
        console.error('❌ Failed to rotate session.');
        process.exit(1);
    }
}

verify().catch(console.error);
