/**
 * Context Manager - Agent working memory
 */

import fs from 'fs/promises';
import path from 'path';

const CONTEXT_DIR = '.obsidian';
const CONTEXT_FILE = 'context.json';

export interface AgentContext {
    session_id: string;
    mode: 'auto' | 'plan' | 'safe';
    current_task: string | null;
    files_read: string[];
    files_modified: string[];
    working_set: string[];
    last_action: string | null;
    created_at: string;
    updated_at: string;
}

function generateSessionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createEmptyContext(): AgentContext {
    const now = new Date().toISOString();
    return {
        session_id: generateSessionId(),
        mode: 'safe',
        current_task: null,
        files_read: [],
        files_modified: [],
        working_set: [],
        last_action: null,
        created_at: now,
        updated_at: now,
    };
}

class ContextManager {
    private ctx: AgentContext = createEmptyContext();
    private contextPath: string;

    constructor() {
        this.contextPath = path.join(process.cwd(), CONTEXT_DIR, CONTEXT_FILE);
    }

    async init(): Promise<void> {
        const dir = path.join(process.cwd(), CONTEXT_DIR);
        try {
            await fs.mkdir(dir, { recursive: true });
            await this.load();
        } catch {
            this.ctx = createEmptyContext();
            await this.save();
        }
    }

    async load(): Promise<void> {
        try {
            const data = await fs.readFile(this.contextPath, 'utf-8');
            this.ctx = JSON.parse(data);
        } catch {
            this.ctx = createEmptyContext();
        }
    }

    async save(): Promise<void> {
        this.ctx.updated_at = new Date().toISOString();
        await fs.writeFile(this.contextPath, JSON.stringify(this.ctx, null, 2));
    }

    // Getters
    get(): AgentContext {
        return { ...this.ctx };
    }

    getMode(): AgentContext['mode'] {
        return this.ctx.mode;
    }

    getCurrentTask(): string | null {
        return this.ctx.current_task;
    }

    getWorkingSet(): string[] {
        return [...this.ctx.working_set];
    }

    // Setters
    async setMode(mode: AgentContext['mode']): Promise<void> {
        this.ctx.mode = mode;
        await this.save();
    }

    async setTask(task: string | null): Promise<void> {
        this.ctx.current_task = task;
        await this.save();
    }

    // Tracking
    async trackRead(filePath: string): Promise<void> {
        const normalized = path.relative(process.cwd(), path.resolve(filePath));
        if (!this.ctx.files_read.includes(normalized)) {
            this.ctx.files_read.push(normalized);
        }
        if (!this.ctx.working_set.includes(normalized)) {
            this.ctx.working_set.push(normalized);
        }
        await this.save();
    }

    async trackModified(filePath: string): Promise<void> {
        const normalized = path.relative(process.cwd(), path.resolve(filePath));
        if (!this.ctx.files_modified.includes(normalized)) {
            this.ctx.files_modified.push(normalized);
        }
        if (!this.ctx.working_set.includes(normalized)) {
            this.ctx.working_set.push(normalized);
        }
        await this.save();
    }

    async setLastAction(action: string): Promise<void> {
        this.ctx.last_action = action;
        await this.save();
    }

    // Reset
    async reset(): Promise<void> {
        this.ctx = createEmptyContext();
        await this.save();
    }

    async clearWorkingSet(): Promise<void> {
        this.ctx.working_set = [];
        await this.save();
    }

    // Summary for LLM
    getSummary(): string {
        const lines: string[] = [];
        if (this.ctx.current_task) {
            lines.push(`Task: ${this.ctx.current_task}`);
        }
        if (this.ctx.working_set.length > 0) {
            lines.push(`Working set: ${this.ctx.working_set.slice(-5).join(', ')}`);
        }
        if (this.ctx.files_modified.length > 0) {
            lines.push(`Modified: ${this.ctx.files_modified.slice(-3).join(', ')}`);
        }
        return lines.join('\n');
    }
}

export const context = new ContextManager();
