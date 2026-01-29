/**
 * Task Tracker - Persistent task progress in .obsidian/tasks.md
 */

import fs from 'fs/promises';
import path from 'path';

const TASKS_DIR = '.obsidian';
const TASKS_FILE = 'tasks.md';

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
    private tasksPath: string;

    constructor() {
        this.tasksPath = path.join(process.cwd(), TASKS_DIR, TASKS_FILE);
    }

    async init(): Promise<void> {
        const dir = path.join(process.cwd(), TASKS_DIR);
        await fs.mkdir(dir, { recursive: true });
        await this.load();
    }

    async load(): Promise<void> {
        try {
            const content = await fs.readFile(this.tasksPath, 'utf-8');
            this.task = this.parse(content);
        } catch {
            this.task = null;
        }
    }

    private parse(content: string): Task | null {
        const lines = content.split('\n');
        let title = '';
        let status: Task['status'] = 'pending';
        const subtasks: Subtask[] = [];
        const context: string[] = [];

        for (const line of lines) {
            // Title
            if (line.startsWith('# ')) {
                title = line.slice(2).trim();
                continue;
            }

            // Status
            if (line.startsWith('Status: ')) {
                const s = line.slice(8).trim().toLowerCase();
                if (['pending', 'in_progress', 'blocked', 'done'].includes(s)) {
                    status = s as Task['status'];
                }
                continue;
            }

            // Subtask
            const subtaskMatch = line.match(/^- \[([ x])\] (.+)$/);
            if (subtaskMatch) {
                subtasks.push({
                    done: subtaskMatch[1] === 'x',
                    text: subtaskMatch[2],
                });
                continue;
            }

            // Context files
            if (line.startsWith('- Modified: ') || line.startsWith('- Read: ')) {
                context.push(line.slice(2));
            }
        }

        if (!title) return null;

        return {
            id: Date.now().toString(36),
            title,
            status,
            subtasks,
            context,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
    }

    private serialize(): string {
        if (!this.task) return '# No active task\n';

        const lines: string[] = [
            `# ${this.task.title}`,
            '',
            `Status: ${this.task.status}`,
            '',
            '## Progress',
        ];

        for (const st of this.task.subtasks) {
            lines.push(`- [${st.done ? 'x' : ' '}] ${st.text}`);
        }

        if (this.task.context.length > 0) {
            lines.push('', '## Context');
            for (const c of this.task.context) {
                lines.push(`- ${c}`);
            }
        }

        lines.push('', `Updated: ${new Date().toISOString()}`);

        return lines.join('\n');
    }

    async save(): Promise<void> {
        const content = this.serialize();
        await fs.writeFile(this.tasksPath, content);
    }

    // Task management
    async create(title: string): Promise<Task> {
        const now = new Date().toISOString();
        this.task = {
            id: Date.now().toString(36),
            title,
            status: 'in_progress',
            subtasks: [],
            context: [],
            created_at: now,
            updated_at: now,
        };
        await this.save();
        return this.task;
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
        await this.save();
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
