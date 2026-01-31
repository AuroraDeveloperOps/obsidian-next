/**
 * Session Manager - Save and restore complete session state
 *
 * Sessions include:
 * - Context (files, working set, current task)
 * - Conversation history
 * - Task progress
 * - Usage stats
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { AgentEvent, SessionSummary } from '../events/types.js';
import { context, AgentContext } from './context.js';
import { history } from './history.js';
import { tasks, Task } from './tasks.js';
import { usage } from './usage.js';

const SESSIONS_DIR = path.join(os.homedir(), '.obsidian', 'sessions');

export interface SavedSession {
    id: string;
    version: 1;
    savedAt: string;
    workspace: string;
    context: AgentContext;
    history: AgentEvent[];
    task: Task | null;
    stats: {
        totalInputTokens: number;
        totalOutputTokens: number;
        totalCost: number;
        sessionCost: number;
    };
}

export interface SessionInfo {
    id: string;
    savedAt: string;
    workspace: string;
    task: string | null;
    filesModified: number;
}

class SessionManager {
    private startTime: number = Date.now();

    /**
     * Save current session state
     */
    async save(): Promise<{ sessionId: string; path: string }> {
        // Ensure sessions directory exists
        await fs.mkdir(SESSIONS_DIR, { recursive: true });

        const ctx = context.get();
        const sessionId = ctx.session_id;
        const historyEvents = await history.load();
        const task = tasks.get();
        const stats = usage.getStats();

        const session: SavedSession = {
            id: sessionId,
            version: 1,
            savedAt: new Date().toISOString(),
            workspace: process.cwd(),
            context: ctx,
            history: historyEvents,
            task: task,
            stats: {
                totalInputTokens: stats.totalInputTokens,
                totalOutputTokens: stats.totalOutputTokens,
                totalCost: stats.totalCost,
                sessionCost: usage.getSessionCost(),
            },
        };

        const sessionPath = path.join(SESSIONS_DIR, `${sessionId}.json`);
        await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));

        return { sessionId, path: sessionPath };
    }

    /**
     * Load a saved session
     */
    async load(sessionId: string): Promise<SavedSession | null> {
        const sessionPath = path.join(SESSIONS_DIR, `${sessionId}.json`);

        try {
            const data = await fs.readFile(sessionPath, 'utf-8');
            return JSON.parse(data) as SavedSession;
        } catch {
            return null;
        }
    }

    /**
     * List all saved sessions
     */
    async list(): Promise<SessionInfo[]> {
        try {
            await fs.mkdir(SESSIONS_DIR, { recursive: true });
            const files = await fs.readdir(SESSIONS_DIR);
            const sessions: SessionInfo[] = [];

            for (const file of files) {
                if (!file.endsWith('.json')) continue;

                try {
                    const data = await fs.readFile(path.join(SESSIONS_DIR, file), 'utf-8');
                    const session = JSON.parse(data) as SavedSession;
                    sessions.push({
                        id: session.id,
                        savedAt: session.savedAt,
                        workspace: session.workspace,
                        task: session.task?.title || null,
                        filesModified: session.context.files_modified.length,
                    });
                } catch {
                    // Skip invalid session files
                }
            }

            // Sort by date, newest first
            return sessions.sort((a, b) =>
                new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
            );
        } catch {
            return [];
        }
    }

    /**
     * Delete a saved session
     */
    async delete(sessionId: string): Promise<boolean> {
        const sessionPath = path.join(SESSIONS_DIR, `${sessionId}.json`);

        try {
            await fs.unlink(sessionPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Generate session summary for shutdown
     */
    async getSummary(): Promise<SessionSummary> {
        const ctx = context.get();
        const task = tasks.get();

        // Count completed vs pending subtasks
        let tasksCompleted = 0;
        let tasksPending = 0;

        if (task) {
            for (const subtask of task.subtasks) {
                if (subtask.done) {
                    tasksCompleted++;
                } else {
                    tasksPending++;
                }
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

    /**
     * Reset start time (call on session restore)
     */
    resetStartTime(): void {
        this.startTime = Date.now();
    }

    /**
     * Get session duration in ms
     */
    getDuration(): number {
        return Date.now() - this.startTime;
    }

    /**
     * Format duration as human-readable string
     */
    formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
}

export const session = new SessionManager();
