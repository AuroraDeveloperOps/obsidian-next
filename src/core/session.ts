/**
 * Session Manager - SQLite Facade
 * 
 * Orchestrates session restoration and management interactively with the Database.
 */

import { db } from './database.js';
import { AgentEvent, SessionSummary } from '../events/types.js';
import { context } from './context.js';
import { history } from './history.js';
import { tasks } from './tasks.js';
import { usage } from './usage.js';
import { llm } from './llm.js';

export interface SessionInfo {
    id: string;
    savedAt: string;
    task: string | null;
    filesModified: number;
    workspace: string;
}

class SessionManager {
    private startTime: number = Date.now();

    /**
     * Save current session state
     * (V13: Mostly a no-op as state is continuously saved to SQLite)
     */
    async save(): Promise<{ sessionId: string; path: string }> {
        const ctx = context.get();
        await context.save(); // Ensure updated_at is touched

        // Emulate legacy return type
        return { sessionId: ctx.session_id, path: 'sqlite' };
    }

    /**
     * List all saved sessions
     */
    async list(): Promise<SessionInfo[]> {
        try {
            const rows = db.getDb().prepare(`
                SELECT id, created_at, workspace 
                FROM sessions 
                ORDER BY created_at DESC
            `).all() as any[];

            const sessions: SessionInfo[] = [];

            for (const row of rows) {
                // Get task title
                const taskRow = db.getDb().prepare(`
                    SELECT title FROM tasks 
                    WHERE session_id = ? 
                    ORDER BY created_at DESC LIMIT 1
                `).get(row.id) as any;

                // Get mod files count
                const modCount = db.getDb().prepare(`
                    SELECT COUNT(*) as count FROM working_set WHERE session_id = ?
                `).get(row.id) as any;

                sessions.push({
                    id: row.id,
                    savedAt: new Date(row.created_at).toISOString(),
                    task: taskRow ? taskRow.title : null,
                    filesModified: modCount ? modCount.count : 0,
                    workspace: row.workspace || process.cwd(),
                });
            }

            return sessions;
        } catch {
            return [];
        }
    }

    /**
     * Delete a saved session and all related data
     */
    async delete(sessionId: string): Promise<boolean> {
        try {
            const transaction = db.getDb().transaction(() => {
                db.getDb().prepare('DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE session_id = ?)').run(sessionId);
                db.getDb().prepare('DELETE FROM tasks WHERE session_id = ?').run(sessionId);
                db.getDb().prepare('DELETE FROM working_set WHERE session_id = ?').run(sessionId);
                db.getDb().prepare('DELETE FROM usage_stats WHERE session_id = ?').run(sessionId);
                db.getDb().prepare('DELETE FROM events WHERE session_id = ?').run(sessionId);
                db.getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
            });
            transaction();
            return true;
        } catch (e) {
            console.error('Failed to delete session:', e);
            return false;
        }
    }

    /**
     * Restore a saved session
     */
    async restore(sessionId: string): Promise<{ success: boolean; error?: string }> {
        const sessionRow = db.getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
        if (!sessionRow) {
            return { success: false, error: `Session ${sessionId} not found` };
        }

        // 1. Restore Context
        // context.load() sets the global context state
        await context.load(sessionId);

        // 2. Restore History
        const { bus } = await import('./bus.js'); // Dynamic import to avoid cycles if any

        // Load events from DB and restore UI (without clearing DB)
        const events = await history.load();
        const filteredEvents = events.filter(e =>
            e.type !== 'approval_request' && e.type !== 'choice_request'
        );

        // Use restore_history to set events directly without triggering DB clear
        bus.emitAgent({ type: 'restore_history', events: filteredEvents } as any);

        // 3. Restore Tasks
        // tasks.init() calls load() which reads from DB based on context.session_id
        await tasks.init();

        // 4. Restore Usage Stats
        // Aggregate usage from DB for this session
        const stats = db.getDb().prepare(`
            SELECT 
                SUM(cost) as sessionCost,
                SUM(input_tokens) as sessionInputTokens,
                SUM(output_tokens) as sessionOutputTokens,
                MIN(timestamp) as firstLog,
                MAX(timestamp) as lastLog
            FROM usage_stats
            WHERE session_id = ?
        `).get(sessionId) as any;

        const duration = (stats && stats.lastLog && stats.firstLog) ? (stats.lastLog - stats.firstLog) : 0;

        usage.restoreSessionState({
            cost: stats ? stats.sessionCost || 0 : 0,
            inputTokens: stats ? stats.sessionInputTokens || 0 : 0,
            outputTokens: stats ? stats.sessionOutputTokens || 0 : 0,
            cacheReadTokens: 0, // Not currently tracked in usage_stats table separate?
            cacheCreationTokens: 0,
            duration: duration
        });

        this.resetStartTime();
        // Adjust start time to account for previous duration
        this.startTime = Date.now() - duration;

        // 5. Restore LLM Conversation History
        const row = sessionRow as any;
        if (row.llm_history) {
            try {
                const history = JSON.parse(row.llm_history) as any[]; // Typesafe via restoreHistory call
                llm.restoreHistory(history);
            } catch (e) {
                console.error('Failed to parse LLM history:', e);
            }
        }
        // savedSession.conversationHistory was in JSON.
        // In V13, we don't have a column for this yet.
        // Use 'history' (events) to reconstruct?
        // Or did I miss migrating `conversationHistory`?
        // usage.ts doesn't track it.
        // `llm.ts` maintains it.
        // The previous JSON stored `conversationHistory: Anthropic.MessageParam[]`.
        // This is distinct from `AgentEvents`.
        // I need to persist `conversationHistory` to SQLite!
        // Where? `sessions` table could have a `llm_history` blob column?
        // Or reconstructed from `events`? Reconstructing is hard.
        // I should have added `llm_history` column to `sessions` table!

        return { success: true };
    }

    /**
     * Generate session summary for shutdown
     */
    async getSummary(): Promise<SessionSummary> {
        const ctx = context.get();
        const task = tasks.get();

        let tasksCompleted = 0;
        let tasksPending = 0;

        if (task) {
            for (const subtask of task.subtasks) {
                if (subtask.done) tasksCompleted++;
                else tasksPending++;
            }
        }

        return {
            sessionId: ctx.session_id,
            duration: Date.now() - this.startTime,
            filesRead: ctx.files_read.length,
            filesModified: ctx.files_modified.length,
            tasksCompleted,
            tasksPending,
            totalCost: usage.getSessionCost(),
        };
    }

    resetStartTime(): void {
        this.startTime = Date.now();
    }

    getDuration(): number {
        return Date.now() - this.startTime;
    }

    formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        else if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        else return `${seconds}s`;
    }
}

export const session = new SessionManager();
