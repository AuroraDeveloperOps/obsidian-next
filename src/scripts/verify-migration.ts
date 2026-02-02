
import { db } from '../core/database.js';
import { context } from '../core/context.js';
import { tasks } from '../core/tasks.js';
import { history } from '../core/history.js';
import { usage } from '../core/usage.js';
import { session } from '../core/session.js';
import { AgentEvent } from '../events/types.js';

async function verify() {
    console.log('Starting Verification...');

    // 1. Init DB
    console.log('1. Initializing DB...');
    // db is auto-initialized on import usually, but let's ensure schema
    // Accessing db.getDb() triggers init
    const database = db.getDb();
    console.log('   DB initialized.');

    // 2. Start Session
    console.log('2. Starting New Session...');
    await context.init();
    await context.startNewSession();
    const sessionId = context.get().session_id;
    console.log('   Session ID:', sessionId);

    // Verify Session in DB
    const sessionRow = database.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!sessionRow) throw new Error('Session not found in DB');
    console.log('   Session persisted in DB ✅');

    // 3. Track Files (Working Set)
    console.log('3. Tracking Files...');
    await context.trackRead('src/index.ts');
    await context.trackModified('src/core/context.ts');

    const workingSet = database.prepare('SELECT * FROM working_set WHERE session_id = ?').all(sessionId);
    if (workingSet.length !== 2) throw new Error(`Working set count mismatch. Expected 2, got ${workingSet.length}`);
    console.log('   Working Set persisted ✅');

    // 4. Tasks
    console.log('4. Managing Tasks...');
    await tasks.init(); // Bind to session
    await tasks.create('Migration Verification');
    await tasks.addSubtask('Check DB');
    await tasks.completeSubtask(0);

    const taskRow = database.prepare('SELECT * FROM tasks WHERE session_id = ?').get(sessionId) as any;
    if (!taskRow || taskRow.title !== 'Migration Verification') throw new Error('Task persistence failed');

    const subtasks = database.prepare('SELECT * FROM subtasks WHERE task_id = ?').all(taskRow.id);
    if (subtasks.length !== 1) throw new Error('Subtask persistence failed');
    console.log('   Tasks persisted ✅');

    // 5. History
    console.log('5. Logging History...');
    const event: AgentEvent = { type: 'thought', content: 'Verifying DB', timestamp: Date.now() };
    await history.save([event]);

    // Allow debounce
    await new Promise(r => setTimeout(r, 600));

    const events = database.prepare('SELECT * FROM events WHERE session_id = ?').all(sessionId);
    if (events.length !== 1) throw new Error('Event persistence failed');
    console.log('   History persisted ✅');

    // 6. Usage (Stats)
    console.log('6. Tracking Usage...');
    await usage.track('claude-sonnet-4-5-20250929', 100, 50);

    const usageRow = database.prepare('SELECT * FROM usage_stats WHERE session_id = ?').get(sessionId) as any;
    if (!usageRow || usageRow.input_tokens !== 100) throw new Error('Usage persistence failed');
    console.log('   Usage persisted ✅');

    // 7. Verify Restoration
    console.log('7. Verifying Restoration (SessionManager)...');

    // Reset memory
    await context.reset(); // New session effectively

    // Restore
    const result = await session.restore(sessionId);
    if (!result.success) throw new Error('Restoration failed: ' + result.error);

    const restoredCtx = context.get();
    if (restoredCtx.session_id !== sessionId) throw new Error('Restored session ID mismatch');
    if (restoredCtx.working_set.length !== 2) throw new Error('Restored working set mismatch');

    // Verify Task Restoration
    const currentTask = tasks.get();
    if (!currentTask || currentTask.title !== 'Migration Verification') throw new Error('Restored task mismatch');

    console.log('   Restoration successful ✅');
    console.log('ALL CHECKS PASSED');
}

verify().catch(e => {
    console.error('VERIFICATION FAILED:', e);
    process.exit(1);
});
