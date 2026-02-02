/**
 * Memory Manager - Long-term persistent memory using SQLite
 *
 * Stores user preferences, facts, and contextual information
 * that persists across sessions for a personalized experience.
 */

import { db } from './database.js';
import { context } from './context.js';

export type MemoType =
    | 'user_preference'   // User preferences (name, settings, etc.)
    | 'project_fact'      // Facts about the project
    | 'decision_log'      // Important decisions made
    | 'learned_pattern'   // Patterns learned about user's coding style
    | 'daily_summary';    // Session summaries

export interface Memo {
    id: number;
    type: MemoType;
    key: string;
    content: string;
    created_at: string;
    updated_at: string;
}

export class MemoryManager {
    private initialized = false;

    async init(): Promise<void> {
        if (this.initialized) return;
        // Schema is handled by DatabaseManager and MigrationManager
        this.initialized = true;
    }

    /**
     * Store a memory/fact
     */
    async store(type: MemoType, key: string, content: string): Promise<boolean> {
        await this.init();
        const sessionId = context.get().session_id;

        try {
            // Check if this key already exists
            const existing = db.getDb().prepare(`
                SELECT id FROM memos WHERE type = ? AND key = ?
            `).get(type, key) as { id: number } | undefined;

            if (existing) {
                // Update existing
                db.getDb().prepare(`
                    UPDATE memos SET content = ?, updated_at = strftime('%s', 'now'), session_id = ?
                    WHERE id = ?
                `).run(content, sessionId, existing.id);
            } else {
                // Insert new
                db.getDb().prepare(`
                    INSERT INTO memos (session_id, type, key, content)
                    VALUES (?, ?, ?, ?)
                `).run(sessionId, type, key, content);
            }

            return true;
        } catch (e) {
            console.error('Failed to store memory:', e);
            return false;
        }
    }

    /**
     * Recall a specific memory by key
     */
    async recall(key: string): Promise<Memo | null> {
        await this.init();

        try {
            const row = db.getDb().prepare(`
                SELECT id, type, key, content, created_at, updated_at
                FROM memos
                WHERE key = ?
                ORDER BY updated_at DESC
                LIMIT 1
            `).get(key) as any;

            if (!row) return null;

            return {
                id: row.id,
                type: row.type as MemoType,
                key: row.key,
                content: row.content,
                created_at: new Date(row.created_at * 1000).toISOString(),
                updated_at: new Date(row.updated_at * 1000).toISOString(),
            };
        } catch (e) {
            console.error('Failed to recall memory:', e);
            return null;
        }
    }

    /**
     * Search memories by type or content
     */
    async search(query: string, type?: MemoType): Promise<Memo[]> {
        await this.init();

        try {
            let sql = `
                SELECT id, type, key, content, created_at, updated_at
                FROM memos
                WHERE (key LIKE ? OR content LIKE ?)
            `;
            const params: any[] = [`%${query}%`, `%${query}%`];

            if (type) {
                sql += ' AND type = ?';
                params.push(type);
            }

            sql += ' ORDER BY updated_at DESC LIMIT 20';

            const rows = db.getDb().prepare(sql).all(...params) as any[];

            return rows.map(row => ({
                id: row.id,
                type: row.type as MemoType,
                key: row.key,
                content: row.content,
                created_at: new Date(row.created_at * 1000).toISOString(),
                updated_at: new Date(row.updated_at * 1000).toISOString(),
            }));
        } catch (e) {
            console.error('Failed to search memories:', e);
            return [];
        }
    }

    /**
     * Get all memories of a specific type
     */
    async getByType(type: MemoType): Promise<Memo[]> {
        await this.init();

        try {
            const rows = db.getDb().prepare(`
                SELECT id, type, key, content, created_at, updated_at
                FROM memos
                WHERE type = ?
                ORDER BY updated_at DESC
            `).all(type) as any[];

            return rows.map(row => ({
                id: row.id,
                type: row.type as MemoType,
                key: row.key,
                content: row.content,
                created_at: new Date(row.created_at * 1000).toISOString(),
                updated_at: new Date(row.updated_at * 1000).toISOString(),
            }));
        } catch (e) {
            console.error('Failed to get memories by type:', e);
            return [];
        }
    }

    /**
     * Get user preferences summary for context injection
     */
    async getUserContext(): Promise<string> {
        await this.init();

        try {
            const prefs = await this.getByType('user_preference');
            const facts = await this.getByType('project_fact');

            if (prefs.length === 0 && facts.length === 0) {
                return '';
            }

            const lines: string[] = ['[RECALL]'];

            if (prefs.length > 0) {
                for (const p of prefs.slice(0, 5)) {
                    lines.push(`${p.key}: ${p.content}`);
                }
            }

            if (facts.length > 0) {
                for (const f of facts.slice(0, 10)) {
                    lines.push(`${f.key}: ${f.content}`);
                }
            }

            if (lines.length === 1) return '';
            return lines.join('\n');
        } catch (e) {
            return '';
        }
    }

    /**
     * Delete a memory
     */
    async forget(key: string): Promise<boolean> {
        await this.init();

        try {
            db.getDb().prepare('DELETE FROM memos WHERE key = ?').run(key);
            return true;
        } catch (e) {
            console.error('Failed to forget memory:', e);
            return false;
        }
    }

    /**
     * Clear all memories (use with caution)
     */
    async clearAll(): Promise<boolean> {
        await this.init();

        try {
            db.getDb().prepare('DELETE FROM memos').run();
            return true;
        } catch (e) {
            console.error('Failed to clear memories:', e);
            return false;
        }
    }

    /**
     * Get memory statistics
     */
    async getStats(): Promise<{ total: number; byType: Record<string, number> }> {
        await this.init();

        try {
            const total = db.getDb().prepare('SELECT COUNT(*) as count FROM memos').get() as { count: number };

            const byTypeRows = db.getDb().prepare(`
                SELECT type, COUNT(*) as count FROM memos GROUP BY type
            `).all() as { type: string; count: number }[];

            const byType: Record<string, number> = {};
            for (const row of byTypeRows) {
                byType[row.type] = row.count;
            }

            return {
                total: total.count,
                byType,
            };
        } catch (e) {
            return { total: 0, byType: {} };
        }
    }
}

export const memory = new MemoryManager();
