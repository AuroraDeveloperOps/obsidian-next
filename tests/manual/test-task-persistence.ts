
import { tasks } from '../src/core/tasks.js';
import fs from 'fs/promises';
import path from 'path';

async function testPersistence() {
    console.log("1. Initializing tasks...");
    await tasks.init();

    console.log("2. Creating task 'Test Persistence'...");
    await tasks.create("Test Persistence");
    await tasks.addSubtask("Subtask 1");

    console.log("3. Current Progress:", tasks.getProgress());

    if (!tasks.getProgress().includes("Test Persistence")) {
        console.error("FAIL: Task not in memory after create");
        process.exit(1);
    }

    const taskPath = path.join(process.cwd(), '.obsidian', 'tasks.md');
    try {
        const content = await fs.readFile(taskPath, 'utf-8');
        console.log("4. File content verified:\n", content);
    } catch (e) {
        console.error("FAIL: File not written", e);
        process.exit(1);
    }

    console.log("5. Simulating restart (re-loading tasks)...");
    const newTasks = new (tasks.constructor as any)(); // Hacky new instance or just re-init
    // Actually we can just re-init the existing singleton or create a new instance of the class if exported?
    // The class isn't exported, just the instance. 
    // We'll manually call .load() again.

    await tasks.load();
    console.log("6. Progress after reload:", tasks.getProgress());

    if (tasks.getProgress().includes("Test Persistence")) {
        console.log("PASS: Task persisted.");
    } else {
        console.error("FAIL: Task lost after reload.");
        process.exit(1);
    }
}

testPersistence().catch(console.error);
