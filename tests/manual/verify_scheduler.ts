import { scheduler } from '../src/core/scheduler.js';
import { db } from '../src/core/database.js';
import { registerSystemAbilities } from '../src/abilities/system.js';

async function test() {
    console.log('--- Scheduler Verification ---');

    // Register abilities
    registerSystemAbilities(scheduler);

    const cron = '* * * * * *'; // Every second (if supported, otherwise every min)
    const ability = 'system:echo';
    const params = { message: 'VERIFIED_PERSISTENCE_WORKS' };

    console.log('1. Scheduling task...');
    await scheduler.scheduleTask(cron, ability, params);

    console.log('2. Verifying DB record...');
    const tasks = db.getDb().prepare('SELECT * FROM scheduled_tasks ORDER BY last_run_at DESC LIMIT 1').all() as any[];
    const task = tasks[0];

    if (task && task.params === JSON.stringify(params)) {
        console.log('✅ SUCCESS: Params persisted correctly.');
        console.log('Data:', JSON.stringify(task, null, 2));
    } else {
        console.log('❌ FAILURE: Params not found or incorrect.');
        console.log('Data:', JSON.stringify(task, null, 2));
        process.exit(1);
    }

    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
