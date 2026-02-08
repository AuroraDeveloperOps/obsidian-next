/**
 * Memory Manager - Long-term persistent memory using SQLite
 *
 * Stores user preferences, facts, and contextual information
 * that persists across sessions for a personalized experience.
 */

import { db } from './database.js';
import { bus } from './bus.js';
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

export type RelationType =
    | 'related_to'        // General relationship
    | 'derived_from'      // One memo is derived from another
    | 'supersedes'        // One memo replaces another
    | 'contradicts';      // Memos conflict

export interface MemoRelation {
    id: number;
    sourceId: number;
    targetId: number;
    relationType: RelationType;
    strength: number;
    createdAt: string;
}

export interface Memo {
    id: number;
    type: MemoType;
    key: string;
    content: string;
    created_at: string;
    updated_at: string;
    access_count?: number;
    last_accessed?: string;
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
            const embeddingArray = await this.getEmbedding(`${key}: ${content}`);
            // Convert Float32Array to Buffer for SQLite storage
            const embedding = Buffer.from(embeddingArray.buffer);

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
                    memoId = Number(result.lastInsertRowid);
                }

                // Update vector table
                db.getDb().prepare('DELETE FROM vec_memos WHERE rowid = ?').run(BigInt(memoId));
                db.getDb().prepare(`
                    INSERT INTO vec_memos (rowid, embedding)
                    VALUES (?, ?)
                `).run(BigInt(memoId), embedding);
            });

            transaction();
            return true;
        } catch (e) {
            console.error('Failed to store memory:', e);
            bus.emitAgent({ type: 'error', message: `Memory Store Error: ${e instanceof Error ? e.message : String(e)}` });
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
                SELECT id, type, key, content, created_at, updated_at, access_count, last_accessed
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
                access_count: row.access_count || 0,
                last_accessed: row.last_accessed ? new Date(row.last_accessed * 1000).toISOString() : undefined,
            };
        } catch (e) {
            console.error('Failed to recall memory:', e);
            return null;
        }
    }

    /**
     * Search memories by type or content (Semantic Search)
     */
    async search(query: string, type?: MemoType): Promise<Memo[]> {
        await this.init();

        try {
            // Generate query embedding
            const embeddingArray = await this.getEmbedding(query);
            const embedding = Buffer.from(embeddingArray.buffer);

            // Perform KNN search using rowid join
            // Note: In some versions of sqlite-vec, k=? must be in the WHERE clause with MATCH
            let sql = `
                SELECT m.id, m.type, m.key, m.content, m.created_at, m.updated_at,
                       v.distance
                FROM vec_memos v
                JOIN memos m ON v.rowid = m.id
                WHERE v.embedding MATCH ?
                AND k = 20
            `;

            const params: any[] = [embedding];

            if (type) {
                sql = sql.replace('AND k = 20', 'AND m.type = ? AND k = 20');
                params.push(type);
            }

            const rows = db.getDb().prepare(sql).all(...params) as any[];

            if (rows.length === 0) {
                return this.keywordSearch(query, type);
            }

            return rows.map(row => ({
                id: row.id,
                type: row.type as MemoType,
                key: row.key,
                content: row.content,
                created_at: new Date(row.created_at * 1000).toISOString(),
                updated_at: new Date(row.updated_at * 1000).toISOString(),
            }));
        } catch (e) {
            console.error('Failed to semantic search memories:', e);
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

    // ==================== Memory Graph Methods ====================

    /**
     * Add a relationship between two memos
     */
    async addRelation(
        sourceKey: string,
        targetKey: string,
        relationType: RelationType,
        strength: number = 1.0
    ): Promise<boolean> {
        await this.init();

        try {
            const source = await this.recall(sourceKey);
            const target = await this.recall(targetKey);

            if (!source || !target) {
                return false;
            }

            db.getDb().prepare(`
                INSERT OR REPLACE INTO memo_relations (source_id, target_id, relation_type, strength)
                VALUES (?, ?, ?, ?)
            `).run(source.id, target.id, relationType, Math.max(0, Math.min(1, strength)));

            return true;
        } catch (e) {
            console.error('Failed to add memo relation:', e);
            return false;
        }
    }

    /**
     * Get all relationships for a memo
     */
    async getRelations(key: string): Promise<MemoRelation[]> {
        await this.init();

        try {
            const memo = await this.recall(key);
            if (!memo) return [];

            const rows = db.getDb().prepare(`
                SELECT id, source_id, target_id, relation_type, strength, created_at
                FROM memo_relations
                WHERE source_id = ? OR target_id = ?
            `).all(memo.id, memo.id) as any[];

            return rows.map(row => ({
                id: row.id,
                sourceId: row.source_id,
                targetId: row.target_id,
                relationType: row.relation_type as RelationType,
                strength: row.strength,
                createdAt: new Date(row.created_at * 1000).toISOString(),
            }));
        } catch (e) {
            return [];
        }
    }

    /**
     * Get related memos with their relationships
     */
    async getRelatedMemos(key: string): Promise<{ memo: Memo; relation: MemoRelation }[]> {
        await this.init();

        try {
            const memo = await this.recall(key);
            if (!memo) return [];

            const rows = db.getDb().prepare(`
                SELECT 
                    m.id, m.type, m.key, m.content, m.created_at, m.updated_at,
                    m.access_count, m.last_accessed,
                    r.id as rel_id, r.source_id, r.target_id, r.relation_type, r.strength, r.created_at as rel_created
                FROM memo_relations r
                JOIN memos m ON (
                    (r.source_id = ? AND r.target_id = m.id) OR
                    (r.target_id = ? AND r.source_id = m.id)
                )
                WHERE (r.source_id = ? OR r.target_id = ?)
                ORDER BY r.strength DESC
            `).all(memo.id, memo.id, memo.id, memo.id) as any[];

            return rows.map(row => ({
                memo: {
                    id: row.id,
                    type: row.type as MemoType,
                    key: row.key,
                    content: row.content,
                    created_at: new Date(row.created_at * 1000).toISOString(),
                    updated_at: new Date(row.updated_at * 1000).toISOString(),
                    access_count: row.access_count || 0,
                    last_accessed: row.last_accessed ? new Date(row.last_accessed * 1000).toISOString() : undefined,
                },
                relation: {
                    id: row.rel_id,
                    sourceId: row.source_id,
                    targetId: row.target_id,
                    relationType: row.relation_type as RelationType,
                    strength: row.strength,
                    createdAt: new Date(row.rel_created * 1000).toISOString(),
                },
            }));
        } catch (e) {
            return [];
        }
    }

    /**
     * Calculate relevance score with temporal decay
     * Score decays exponentially based on time since last access and access frequency
     */
    getRelevanceScore(memo: Memo): number {
        const now = Date.now();
        const lastAccessed = memo.last_accessed ? new Date(memo.last_accessed).getTime() : now;
        const accessCount = memo.access_count || 1;

        // Decay half-life: 7 days (604800000 ms)
        const halfLife = 7 * 24 * 60 * 60 * 1000;
        const timeSinceAccess = now - lastAccessed;
        const decayFactor = Math.pow(0.5, timeSinceAccess / halfLife);

        // Boost based on access frequency (log scale to prevent runaway)
        const frequencyBoost = 1 + Math.log10(accessCount + 1) * 0.2;

        return decayFactor * frequencyBoost;
    }

    /**
     * Update access stats for a memo (call when memo is retrieved/used)
     */
    async updateAccessStats(key: string): Promise<void> {
        await this.init();

        try {
            db.getDb().prepare(`
                UPDATE memos 
                SET access_count = COALESCE(access_count, 0) + 1,
                    last_accessed = strftime('%s', 'now')
                WHERE key = ?
            `).run(key);
        } catch (e) {
            // Silently fail - access stats are not critical
        }
    }

    /**
     * Search with relationship awareness - includes related memos in results
     */
    async searchWithRelations(query: string, type?: MemoType): Promise<{ memo: Memo; score: number; related: Memo[] }[]> {
        await this.init();

        // Get base search results
        const baseResults = await this.search(query, type);

        // Enrich with relevance scores and related memos
        const enriched = await Promise.all(baseResults.map(async (memo) => {
            // Update access stats
            await this.updateAccessStats(memo.key);

            // Get fresh memo with access stats
            const freshMemo = await this.recall(memo.key);
            const memoWithStats = freshMemo || memo;

            // Calculate relevance score
            const score = this.getRelevanceScore(memoWithStats);

            // Get related memos
            const relatedResults = await this.getRelatedMemos(memo.key);
            const related = relatedResults.map(r => r.memo);

            return { memo: memoWithStats, score, related };
        }));

        // Sort by combined relevance score
        return enriched.sort((a, b) => b.score - a.score);
    }
}

export const memory = new MemoryManager();
