/**
 * Context Manager - Agent working memory
 *
 * FAANG-level implementation with:
 * - Time-decayed rank scoring
 * - Token budget awareness
 * - Semantic importance factors
 */

import { db } from './database.js';
import { settings } from './settings.js';
import path from 'path';

// Context Management Constants
const CONTEXT_CONFIG = {
    DECAY_HALF_LIFE_MS: 3600000,    // 1 hour - files lose half their score every hour
    MAX_WORKING_SET_SIZE: 50,       // Limit working set to prevent unbounded growth
    IMPORTANCE_MODIFIED: 2.0,       // 2x weight for modified files
    IMPORTANCE_ENTRY_POINT: 1.5,    // Higher weight for index.ts, main.ts, etc.
    IMPORTANCE_RECENT_EDIT: 1.3,    // Files edited in last 5 interactions
    TOKEN_ESTIMATE_PER_LINE: 4,     // Rough estimate: 4 tokens per line
};

// Entry point file patterns
const ENTRY_POINT_PATTERNS = [
    /^index\.(ts|tsx|js|jsx)$/,
    /^main\.(ts|tsx|js|jsx)$/,
    /^app\.(ts|tsx|js|jsx)$/,
    /^server\.(ts|tsx|js|jsx)$/,
];

export interface WorkingSetEntry {
    filePath: string;
    accessCount: number;
    lastAccessed: number;
    isModified: boolean;
    tokenEstimate: number;
}

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

/**
 * Calculate time-decayed rank score for a file
 */
function calculateRankScore(
    accessCount: number,
    lastAccessed: number,
    isModified: boolean,
    isEntryPoint: boolean
): number {
    const ageMs = Date.now() - lastAccessed;
    const decayFactor = Math.pow(0.5, ageMs / CONTEXT_CONFIG.DECAY_HALF_LIFE_MS);

    let importanceMultiplier = 1.0;
    if (isModified) importanceMultiplier *= CONTEXT_CONFIG.IMPORTANCE_MODIFIED;
    if (isEntryPoint) importanceMultiplier *= CONTEXT_CONFIG.IMPORTANCE_ENTRY_POINT;

    return accessCount * decayFactor * importanceMultiplier;
}

/**
 * Check if a file is an entry point
 */
function isEntryPointFile(filePath: string): boolean {
    const filename = path.basename(filePath);
    return ENTRY_POINT_PATTERNS.some(pattern => pattern.test(filename));
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
                INSERT INTO sessions (id, created_at, workspace)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                workspace = excluded.workspace,
                created_at = excluded.created_at
            `).run(this.ctx.session_id, timestamp, process.cwd());

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
    async trackRead(filePath: string, tokenEstimate: number = 0): Promise<void> {
        const normalized = path.relative(process.cwd(), path.resolve(filePath));

        // Memory update
        if (!this.ctx.files_read.includes(normalized)) {
            this.ctx.files_read.push(normalized);
        }
        if (!this.ctx.working_set.includes(normalized)) {
            this.ctx.working_set.push(normalized);
        }

        // DB Update with time-decayed rank score
        try {
            const timestamp = Date.now();
            const isModified = this.ctx.files_modified.includes(normalized);
            const isEntryPoint = isEntryPointFile(normalized);

            // Get current access count for rank calculation
            const existing = db.getDb().prepare(`
                SELECT access_count FROM working_set
                WHERE session_id = ? AND file_path = ?
            `).get(this.ctx.session_id, normalized) as { access_count: number } | undefined;

            const newAccessCount = (existing?.access_count || 0) + 1;
            const rankScore = calculateRankScore(newAccessCount, timestamp, isModified, isEntryPoint);

            db.getDb().prepare(`
                INSERT INTO working_set (session_id, file_path, rank_score, last_accessed, access_count)
                VALUES (?, ?, ?, ?, 1)
                ON CONFLICT(session_id, file_path) DO UPDATE SET
                access_count = access_count + 1,
                last_accessed = ?,
                rank_score = ?
            `).run(this.ctx.session_id, normalized, rankScore, timestamp, timestamp, rankScore);

            // Prune working set if it exceeds max size
            await this.pruneWorkingSet();
        } catch (e) {
            console.error('Failed to track read:', e);
        }
    }

    async trackModified(filePath: string, tokenEstimate: number = 0): Promise<void> {
        const normalized = path.relative(process.cwd(), path.resolve(filePath));
        if (!this.ctx.files_modified.includes(normalized)) {
            this.ctx.files_modified.push(normalized);
        }

        // Update rank score with modified bonus in DB
        try {
            const timestamp = Date.now();
            const existing = db.getDb().prepare(`
                SELECT access_count FROM working_set
                WHERE session_id = ? AND file_path = ?
            `).get(this.ctx.session_id, normalized) as { access_count: number } | undefined;

            const accessCount = existing?.access_count || 1;
            const isEntryPoint = isEntryPointFile(normalized);
            const rankScore = calculateRankScore(accessCount, timestamp, true, isEntryPoint);

            db.getDb().prepare(`
                UPDATE working_set SET rank_score = ?, last_accessed = ?
                WHERE session_id = ? AND file_path = ?
            `).run(rankScore, timestamp, this.ctx.session_id, normalized);
        } catch (e) {
            // File might not be in working set yet, add it
            await this.trackRead(filePath, tokenEstimate);
        }
    }

    /**
     * Prune working set to prevent unbounded growth
     * Keeps top N files by rank score
     */
    private async pruneWorkingSet(): Promise<void> {
        try {
            const count = db.getDb().prepare(`
                SELECT COUNT(*) as count FROM working_set WHERE session_id = ?
            `).get(this.ctx.session_id) as { count: number };

            if (count.count > CONTEXT_CONFIG.MAX_WORKING_SET_SIZE) {
                // Delete lowest-ranked files
                db.getDb().prepare(`
                    DELETE FROM working_set
                    WHERE session_id = ? AND file_path NOT IN (
                        SELECT file_path FROM working_set
                        WHERE session_id = ?
                        ORDER BY rank_score DESC
                        LIMIT ?
                    )
                `).run(this.ctx.session_id, this.ctx.session_id, CONTEXT_CONFIG.MAX_WORKING_SET_SIZE);

                // Update in-memory working set
                const remaining = db.getDb().prepare(`
                    SELECT file_path FROM working_set
                    WHERE session_id = ?
                    ORDER BY rank_score DESC
                `).all(this.ctx.session_id) as { file_path: string }[];

                this.ctx.working_set = remaining.map(r => r.file_path);
            }
        } catch (e) {
            console.error('Failed to prune working set:', e);
        }
    }

    /**
     * Get working set entries with full metadata
     */
    getWorkingSetWithMetadata(): WorkingSetEntry[] {
        try {
            const rows = db.getDb().prepare(`
                SELECT file_path, access_count, last_accessed, rank_score
                FROM working_set
                WHERE session_id = ?
                ORDER BY rank_score DESC
            `).all(this.ctx.session_id) as {
                file_path: string;
                access_count: number;
                last_accessed: number;
                rank_score: number;
            }[];

            return rows.map(r => ({
                filePath: r.file_path,
                accessCount: r.access_count,
                lastAccessed: r.last_accessed,
                isModified: this.ctx.files_modified.includes(r.file_path),
                tokenEstimate: 0 // Would need to read file to estimate
            }));
        } catch (e) {
            return [];
        }
    }

    /**
     * Recalculate all rank scores (useful for periodic refresh)
     */
    async recalculateRankScores(): Promise<void> {
        try {
            const rows = db.getDb().prepare(`
                SELECT file_path, access_count, last_accessed
                FROM working_set
                WHERE session_id = ?
            `).all(this.ctx.session_id) as {
                file_path: string;
                access_count: number;
                last_accessed: number;
            }[];

            const updateStmt = db.getDb().prepare(`
                UPDATE working_set SET rank_score = ?
                WHERE session_id = ? AND file_path = ?
            `);

            db.getDb().transaction(() => {
                for (const row of rows) {
                    const isModified = this.ctx.files_modified.includes(row.file_path);
                    const isEntryPoint = isEntryPointFile(row.file_path);
                    const newScore = calculateRankScore(
                        row.access_count,
                        row.last_accessed,
                        isModified,
                        isEntryPoint
                    );
                    updateStmt.run(newScore, this.ctx.session_id, row.file_path);
                }
            })();
        } catch (e) {
            console.error('Failed to recalculate rank scores:', e);
        }
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

        // Get top-ranked files from working set (with time decay applied)
        const topFiles = this.getWorkingSetWithMetadata().slice(0, 5);
        if (topFiles.length > 0) {
            const fileList = topFiles.map(f => {
                const modified = f.isModified ? '*' : '';
                return `${modified}${f.filePath}`;
            }).join(', ');
            lines.push(`Working set (top 5): ${fileList}`);
        }

        if (this.ctx.files_modified.length > 0) {
            lines.push(`Modified this session: ${this.ctx.files_modified.slice(-3).join(', ')}`);
        }

        return lines.join('\n');
    }

    /**
     * Get context statistics for monitoring
     */
    getStats(): {
        totalFilesRead: number;
        totalFilesModified: number;
        workingSetSize: number;
        sessionAge: number;
    } {
        return {
            totalFilesRead: this.ctx.files_read.length,
            totalFilesModified: this.ctx.files_modified.length,
            workingSetSize: this.ctx.working_set.length,
            sessionAge: Date.now() - new Date(this.ctx.created_at).getTime(),
        };
    }
}

export const context = new ContextManager();
