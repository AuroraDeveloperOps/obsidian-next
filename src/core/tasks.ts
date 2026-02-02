/**
 * Task Tracker - Persistent task progress in SQLite
 */

import { db } from './database.js';
import { bus } from './bus.js';
import { context } from './context.js';

export interface Task {
    id: string;
    title: string;
    status: 'pending' | 'in_progress' | 'blocked' | 'done';
    subtasks: Subtask[];
    context: string[];
    created_at: string;
    updated_at: string;
}

export interface Subtask {
    text: string;
    done: boolean;
}

class TaskTracker {
    private task: Task | null = null;

    constructor() { }

    async init(): Promise<void> {
        await this.load();
    }

    async load(): Promise<void> {
        try {
            const currentSessionId = context.get().session_id;

            // Allow loading tasks even if context isn't fully ready (e.g. tests)
            if (!currentSessionId) {
                this.task = null;
                return;
            }

            const row = db.getDb().prepare(`
                SELECT * FROM tasks 
                WHERE session_id = ? 
                AND status != 'done' -- Only load active task? Or the most recent one?
                ORDER BY created_at DESC 
                LIMIT 1
            `).get(currentSessionId) as any;

            if (row) {
                // Load subtasks
                const subtasks = db.getDb().prepare(`
                    SELECT text, done FROM subtasks 
                    WHERE task_id = ? 
                    ORDER BY position ASC
                `).all(row.id) as { text: string; done: number }[];

                this.task = {
                    id: row.id,
                    title: row.title,
                    status: row.status as Task['status'],
                    subtasks: subtasks.map(s => ({ text: s.text, done: s.done === 1 })),
                    context: row.context ? JSON.parse(row.context) : [],
                    created_at: new Date(row.created_at).toISOString(),
                    updated_at: new Date(row.updated_at).toISOString(),
                };
            } else {
                this.task = null;
            }
        } catch (e) {
            console.error('Failed to load task:', e);
            this.task = null;
        }
        // Emit update so UI syncs immediately (important for /resume)
        bus.emitAgent({ type: 'task_update', task: this.task });
    }

    async save(): Promise<void> {
        if (!this.task) return;

        try {
            const currentSessionId = context.get().session_id;

            const updateSubtasks = db.getDb().transaction(() => {
                // Upsert Task
                db.getDb().prepare(`
                    INSERT INTO tasks (id, session_id, title, status, context, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET 
                    status = excluded.status,
                    context = excluded.context,
                    updated_at = excluded.updated_at
                `).run(
                    this.task!.id,
                    currentSessionId,
                    this.task!.title,
                    this.task!.status,
                    JSON.stringify(this.task!.context),
                    new Date(this.task!.created_at).getTime(),
                    new Date(this.task!.updated_at).getTime()
                );

                // Re-insert subtasks (simplest way to handle reordering/deletions)
                db.getDb().prepare('DELETE FROM subtasks WHERE task_id = ?').run(this.task!.id);

                const stmt = db.getDb().prepare('INSERT INTO subtasks (id, task_id, text, done, position) VALUES (?, ?, ?, ?, ?)');
                this.task!.subtasks.forEach((st, idx) => {
                    stmt.run(
                        this.task!.id + '_' + idx, // Simple deterministic ID
                        this.task!.id,
                        st.text,
                        st.done ? 1 : 0,
                        idx
                    );
                });
            });

            updateSubtasks();

            bus.emitAgent({ type: 'task_update', task: this.task });

        } catch (e) {
            console.error('Failed to save task:', e);
        }
    }

    async archive(): Promise<void> {
        // No-op in SQLite. Tasks persist.
        // We could move them to an archive table or mark them archived?
        // Current logic just relies on loading "status != done".
    }

    // Task management
    async create(title: string): Promise<Task> {
        const now = new Date().toISOString();
        this.task = {
            id: Date.now().toString(36), // Use simple ID, or UUID?
            title,
            status: 'in_progress',
            subtasks: [],
            context: [],
            created_at: now,
            updated_at: now,
        };
        await this.save();
        return this.task!;
    }

    async addSubtask(text: string): Promise<void> {
        if (!this.task) return;
        this.task.subtasks.push({ text, done: false });
        this.task.updated_at = new Date().toISOString();
        await this.save();
    }

    async completeSubtask(index: number): Promise<void> {
        if (!this.task || index >= this.task.subtasks.length) return;
        this.task.subtasks[index].done = true;
        this.task.updated_at = new Date().toISOString();
        await this.save();
    }

    async setStatus(status: Task['status']): Promise<void> {
        if (!this.task) return;
        this.task.status = status;
        this.task.updated_at = new Date().toISOString();
        await this.save();
    }

    async addContext(ctx: string): Promise<void> {
        if (!this.task) return;
        if (!this.task.context.includes(ctx)) {
            this.task.context.push(ctx);
            await this.save();
        }
    }

    async complete(): Promise<void> {
        if (!this.task) return;
        this.task.status = 'done';
        // Mark all subtasks done
        for (const st of this.task.subtasks) {
            st.done = true;
        }
        await this.save();
    }

    async clear(): Promise<void> {
        this.task = null;
        // In DB terms, this just means "Forget active task". 
        // We don't delete from DB, just clear in-memory. 
        // Next load() will find nothing since we key off `status != done` usually?
        // Wait, if I clear active task, I should probably mark it inactive/done or just nullify reference?
        // Existing logic `fs.writeFile` overwrites with "No active task".
        // Here, we just set `this.task = null`.
        // BUT, `save` checks `if (!this.task) return`.
        // So `clear()` implies "Stop tracking". The DB record remains as is.
        bus.emitAgent({ type: 'task_update', task: null });
    }

    // Getters
    get(): Task | null {
        return this.task ? { ...this.task } : null;
    }

    getProgress(): string {
        if (!this.task) return 'No active task';
        const done = this.task.subtasks.filter(s => s.done).length;
        const total = this.task.subtasks.length;
        return `${this.task.title} [${done}/${total}]`;
    }

    hasActiveTask(): boolean {
        return this.task !== null && this.task.status !== 'done';
    }
}

export const tasks = new TaskTracker();
