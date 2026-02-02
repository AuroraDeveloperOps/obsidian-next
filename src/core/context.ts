/**
 * Context Manager - Agent working memory
 */

import { db } from './database.js';
import { settings } from './settings.js';
import path from 'path';

export interface AgentContext {
    session_id: string;
    mode: 'auto' | 'plan' | 'safe';
    current_task: string | null; // Deprecated in favor of TasksManager, kept for compatibility
    files_read: string[]; // Transient list for this session
    files_modified: string[]; // Transient list
    working_set: string[]; // Rank-based set
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

    constructor() { }

    async init(): Promise<void> {
        // Try to load the most recent session from DB
        try {
            const lastSession = db.getDb().prepare(`
                SELECT id, created_at, source, permissions 
                FROM sessions 
                ORDER BY created_at DESC 
                LIMIT 1
            `).get() as any;

            if (lastSession) {
                await this.load(lastSession.id);
            } else {
                this.ctx = createEmptyContext();
                await this.save();
            }
        } catch (e) {
            console.error('Failed to init context from DB:', e);
            this.ctx = createEmptyContext();
            await this.save();
        }
    }

    async load(sessionId?: string): Promise<void> {
        if (!sessionId) return; // Should likely verify if current ctx is valid

        try {
            const session = db.getDb().prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as any;
            if (!session) return;

            // Load Working Set
            const workingSetRows = db.getDb().prepare(`
                SELECT file_path 
                FROM working_set 
                WHERE session_id = ? 
                ORDER BY rank_score DESC
            `).all(sessionId) as { file_path: string }[];

            this.ctx = {
                session_id: session.id,
                mode: 'safe', // Mode loaded from settings usually, but DB could store it if we added column
                current_task: null, // Tasks are now in 'tasks' table
                files_read: [], // Reset on load, or we could store this in DB if needed
                files_modified: [],
                working_set: workingSetRows.map(r => r.file_path),
                last_action: null,
                created_at: new Date(session.created_at).toISOString(),
                updated_at: new Date().toISOString(), // Refreshed
            };

            // Sync mode
            await this.syncModeFromSettings();

        } catch (e) {
            console.error('Failed to load context:', e);
        }
    }

    async save(): Promise<void> {
        this.ctx.updated_at = new Date().toISOString();

        try {
            const timestamp = Date.now();

            // 1. Upsert Session
            db.getDb().prepare(`
                INSERT INTO sessions (id, created_at)
                VALUES (?, ?)
                ON CONFLICT(id) DO UPDATE SET 
                summary = excluded.summary -- Just a placeholder update to keep syntax
            `).run(this.ctx.session_id, timestamp);

            // 2. Upsert Working Set (Transaction)
            const insertFile = db.getDb().prepare(`
                INSERT INTO working_set (session_id, file_path, rank_score, last_accessed, access_count)
                VALUES (?, ?, ?, ?, 1)
                ON CONFLICT(session_id, file_path) DO UPDATE SET 
                access_count = access_count + 1,
                last_accessed = ?
            `);

            // We only explicitly save "working_set" array here if it was modified in memory.
            // Ideally trackRead() calls DB directly.
            // For backward compat, we iterate ctx.working_set and ensure they exist.
            const transaction = db.getDb().transaction(() => {
                for (const file of this.ctx.working_set) {
                    // Simple logic: if in working set, ensure it's in DB.
                    // Real Smart Rank logic happens in trackRead
                    insertFile.run(this.ctx.session_id, file, 1.0, timestamp, timestamp);
                }
            });
            transaction();

        } catch (e) {
            console.error('Failed to save context to DB:', e);
        }
    }

    async archive(): Promise<void> {
        // No-op in SQLite architecture. Sessions are persistent history.
        // We could flag it as "archived" if we added a status column.
    }

    async startNewSession(): Promise<void> {
        // Create fresh context but preserve mode preference
        const oldMode = this.ctx.mode;
        this.ctx = createEmptyContext();
        this.ctx.mode = oldMode;

        await this.save();
        await settings.set('mode', this.ctx.mode);
    }

    // Getters
    get(): AgentContext {
        return { ...this.ctx };
    }

    getMode(): AgentContext['mode'] {
        return this.ctx.mode;
    }

    async syncModeFromSettings(): Promise<void> {
        const s = await settings.load();
        this.ctx.mode = s.mode;
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
        await settings.set('mode', mode);
        // await this.save(); // Mode is not in DB sessions table yet, strictly settings
    }

    async setTask(task: string | null): Promise<void> {
        this.ctx.current_task = task;
        // In V13, tasks are managed by TasksManager. This method might be deprecated.
        // But for compatibility we keep it.
    }

    // Tracking
    async trackRead(filePath: string): Promise<void> {
        const normalized = path.relative(process.cwd(), path.resolve(filePath));

        // Memory update
        if (!this.ctx.files_read.includes(normalized)) {
            this.ctx.files_read.push(normalized);
        }
        if (!this.ctx.working_set.includes(normalized)) {
            this.ctx.working_set.push(normalized);
        }

        // DB Update (Smart Rank Logic)
        try {
            const timestamp = Date.now();
            db.getDb().prepare(`
                INSERT INTO working_set (session_id, file_path, rank_score, last_accessed, access_count)
                VALUES (?, ?, ?, ?, 1)
                ON CONFLICT(session_id, file_path) DO UPDATE SET 
                access_count = access_count + 1,
                last_accessed = ?,
                rank_score = (access_count * 1.0) -- Simplified Score
            `).run(this.ctx.session_id, normalized, 1.0, timestamp, timestamp);
        } catch (e) {
            console.error('Failed to track read:', e);
        }
    }

    async trackModified(filePath: string): Promise<void> {
        const normalized = path.relative(process.cwd(), path.resolve(filePath));
        if (!this.ctx.files_modified.includes(normalized)) {
            this.ctx.files_modified.push(normalized);
        }
        // Force add to working set
        await this.trackRead(filePath);
    }

    async setLastAction(action: string): Promise<void> {
        this.ctx.last_action = action;
        // Could save to events table?
    }

    // Reset
    async reset(): Promise<void> {
        this.ctx = createEmptyContext();
        await this.save();
    }

    async clearWorkingSet(): Promise<void> {
        this.ctx.working_set = [];
        // DB clear
        db.getDb().prepare('DELETE FROM working_set WHERE session_id = ?').run(this.ctx.session_id);
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
