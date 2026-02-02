
import { vi, describe, test, expect, beforeAll, afterEach, beforeEach } from 'vitest';
import { tasks } from '../../src/core/tasks';
import { bus } from '../../src/core/bus';
import { db } from '../../src/core/database';
import { context } from '../../src/core/context';
import { TaskTool } from '../../src/core/tools';
import { agent } from '../../src/core/agent';

describe('Task System Integration', () => {
    beforeEach(async () => {
        // Use memory DB
        db.reconnect(':memory:');
        await context.init(); // Init context for session ID
        // Initialize systems
        await tasks.init();
    });

    afterEach(async () => {
        // clean up
        db.close();
    });

    test('TaskTool creates task and emits event', async () => {
        const eventSpy = vi.fn();
        bus.on('agent', eventSpy);

        // Execute tool to create task
        const result = await TaskTool.execute({
            action: 'create',
            title: 'Integration Test Task'
        });

        expect(result.success).toBe(true);
        expect(tasks.get()?.title).toBe('Integration Test Task');

        // Verify persistence (DB)
        // Check DB directly.
        const row = db.getDb().prepare('SELECT * FROM tasks WHERE title = ?').get('Integration Test Task') as any;
        expect(row).toBeDefined();
        expect(row.title).toBe('Integration Test Task');

        // Verify event emission
        expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'task_update',
            task: expect.objectContaining({ title: 'Integration Test Task' })
        }));
    });

    test('Agent flow handles task steps', async () => {
        // Create initial task
        await tasks.create('Multi-step Task');

        // Add step via tool
        await TaskTool.execute({
            action: 'add_step',
            step: 'Step 1'
        });

        let task = tasks.get();
        expect(task?.subtasks).toHaveLength(1);
        expect(task?.subtasks[0].text).toBe('Step 1');
        expect(task?.subtasks[0].done).toBe(false);

        // Complete step via tool
        await TaskTool.execute({
            action: 'complete_step',
            step_index: 0
        });

        task = tasks.get();
        expect(task?.subtasks[0].done).toBe(true);
    });

    test('Resume logic: emit on load', async () => {
        // 1. Create a task and save it
        await tasks.create('Persistent Task');

        // 2. Clear memory state
        // access private field via any to reset for test
        (tasks as any).task = null;

        // 3. Setup spy for init/load
        const eventSpy = vi.fn();
        bus.on('agent', eventSpy);

        // 4. Call load() (simulating startup)
        await tasks.load();

        // 5. Verify event emitted with restored task
        expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'task_update',
            task: expect.objectContaining({ title: 'Persistent Task' })
        }));
    });
});
