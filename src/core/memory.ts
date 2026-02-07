/**
 * Memory Manager - Long-term persistent memory using SQLite
 *
 * Stores user preferences, facts, and contextual information
 * that persists across sessions for a personalized experience.
 */

import { db } from './database.js';
import { context } from './context.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { pipeline } from '@xenova/transformers';
import chokidar from 'chokidar';

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
    private extractor: any = null;
    private watcher: any = null;

    async init(): Promise<void> {
        if (this.initialized) return;
        
        // Load embedding model lazily
        try {
            this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        } catch (e) {
            console.error('Failed to initialize embedding pipeline:', e);
        }

        this.initialized = true;
        this.startWatcher();
    }

    private startWatcher() {
        const memoryPath = path.join(os.homedir(), '.obsidian-next', 'MEMORY.md');
        
        if (this.watcher) return;

        this.watcher = chokidar.watch(memoryPath, {
            persistent: true,
            ignoreInitial: true
        });

        this.watcher.on('change', async () => {
            try {
                await this.importFromMarkdown(memoryPath);
            } catch (e) {
                // Ignore watcher errors
            }
        });
    }

    async importFromMarkdown(filePath: string): Promise<void> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const sections = content.split('## ').slice(1);

            const typeMap: Record<string, MemoType> = {
                'User Preferences': 'user_preference',
                'Project Facts': 'project_fact',
                'Decision Log': 'decision_log',
                'Learned Patterns': 'learned_pattern',
                'Daily Summaries': 'daily_summary'
            };

            for (const section of sections) {
                const lines = section.split('\n');
                const typeHeader = lines[0].trim();
                const type = typeMap[typeHeader];
                if (!type) continue;

                const memoBlocks = section.split('### ').slice(1);
                for (const block of memoBlocks) {
                    const blockLines = block.split('\n');
                    const key = blockLines[0].trim();
                    const memoContent = blockLines.slice(1)
                        .filter(l => !l.trim().startsWith('*Last updated:'))
                        .join('\n').trim();

                    if (key && memoContent) {
                        await this.store(type, key, memoContent);
                    }
                }
            }
        } catch {
            // Ignore parse errors
        }
    }

    private async getEmbedding(text: string): Promise<Float32Array> {
        await this.init();
        if (!this.extractor) throw new Error('Embedding pipeline not initialized');

        const output = await this.extractor(text, { pooling: 'mean', normalize: true });
        return Float32Array.from(output.data);
    }

    /**
     * Store a memory/fact
     */
    async store(type: MemoType, key: string, content: string): Promise<boolean> {
        await this.init();
        const sessionId = context.get().session_id;

        try {
            // Generate embedding first
            const embedding = await this.getEmbedding(`${key}: ${content}`);

            // Use transaction for consistency
            const transaction = db.getDb().transaction(() => {
                // Check if this key already exists
                const existing = db.getDb().prepare(`
                    SELECT id FROM memos WHERE type = ? AND key = ?
                `).get(type, key) as { id: number } | undefined;

                let memoId: number;

                if (existing) {
                    // Update existing
                    db.getDb().prepare(`
                        UPDATE memos SET content = ?, updated_at = strftime('%s', 'now'), session_id = ?
                        WHERE id = ?
                    `).run(content, sessionId, existing.id);
                    memoId = existing.id;
                } else {
                    // Insert new
                    const result = db.getDb().prepare(`
                        INSERT INTO memos (session_id, type, key, content)
                        VALUES (?, ?, ?, ?)
                    `).run(sessionId, type, key, content);
                    memoId = result.lastInsertRowid as number;
                }

                // Update vector table
                db.getDb().prepare(`
                    INSERT INTO vec_memos (memo_id, embedding)
                    VALUES (?, ?)
                    ON CONFLICT(memo_id) DO UPDATE SET embedding = excluded.embedding
                `).run(memoId, embedding);
            });

            transaction();
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
            // Generate query embedding
            const embedding = await this.getEmbedding(query);

            // Perform KNN search
            let sql = `
                SELECT m.id, m.type, m.key, m.content, m.created_at, m.updated_at,
                       v.distance
                FROM vec_memos v
                JOIN memos m ON v.memo_id = m.id
                WHERE v.embedding MATCH ?
            `;
            const params: any[] = [embedding];

            if (type) {
                sql += ' AND m.type = ?';
                params.push(type);
            }

            sql += ' ORDER BY v.distance ASC LIMIT 20';

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
            // Fallback to keyword search
            return this.keywordSearch(query, type);
        }
    }

    private async keywordSearch(query: string, type?: MemoType): Promise<Memo[]> {
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

    /**
     * Export all memories to a Markdown file for human readability
     */
    async exportToMarkdown(): Promise<string> {
        await this.init();

        try {
            const rows = db.getDb().prepare(`
                SELECT type, key, content, updated_at 
                FROM memos 
                ORDER BY type, key
            `).all() as any[];

            if (rows.length === 0) {
                return 'No memories to export.';
            }

            let markdown = '# Obsidian Memory Bank\n\n';
            markdown += `Generated on: ${new Date().toLocaleString()}\n\n`;

            const grouped: Record<string, any[]> = {};
            for (const row of rows) {
                if (!grouped[row.type]) grouped[row.type] = [];
                grouped[row.type].push(row);
            }

            const typeNames: Record<string, string> = {
                'user_preference': 'User Preferences',
                'project_fact': 'Project Facts',
                'decision_log': 'Decision Log',
                'learned_pattern': 'Learned Patterns',
                'daily_summary': 'Daily Summaries'
            };

            for (const type of Object.keys(grouped)) {
                markdown += `## ${typeNames[type] || type}\n\n`;
                for (const memo of grouped[type]) {
                    markdown += `### ${memo.key}\n`;
                    markdown += `${memo.content}\n\n`;
                    markdown += `*Last updated: ${new Date(memo.updated_at * 1000).toLocaleString()}*\n\n`;
                }
            }

            const { config } = await import('./config.js');
            const cfg = await config.load();
            const exportDir = path.join(os.homedir(), '.obsidian-next');
            const exportPath = path.join(exportDir, 'MEMORY.md');

            await fs.mkdir(exportDir, { recursive: true });
            await fs.writeFile(exportPath, markdown, 'utf-8');

            return exportPath;
        } catch (error: any) {
            console.error('Failed to export memory:', error);
            throw new Error(`Failed to export memory: ${error.message}`);
        }
    }
}

export const memory = new MemoryManager();
