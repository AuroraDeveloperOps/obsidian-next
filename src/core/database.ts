import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import os from 'os';
import * as sqliteVec from 'sqlite-vec';

const DB_DIR = path.join(os.homedir(), '.obsidian-next');
const DB_PATH = path.join(DB_DIR, 'state.db');

export class DatabaseManager {
    private db: Database.Database;
    private static instance: DatabaseManager;

    private constructor() {
        // Ensure directory exists
        if (!existsSync(DB_DIR)) {
            mkdirSync(DB_DIR, { recursive: true });
        }

        this.db = new Database(DB_PATH);
        this.db.pragma('journal_mode = WAL'); // High concurrency
        
        // Load sqlite-vec extension
        sqliteVec.load(this.db);
        
        this.initSchema();
    }

    public static getInstance(): DatabaseManager {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }

    private initSchema() {
        // Tier 1: Core State (Hot)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                created_at INTEGER,
                workspace TEXT,
                summary TEXT,
                source TEXT DEFAULT 'cli', -- 'cli', 'telegram', 'desktop_automator'
                permissions TEXT DEFAULT 'sandbox', -- 'sandbox', 'high_trust', 'read_only'
                llm_history TEXT -- JSON blob of Anthropic.MessageParam[]
            );
        `);

        this.db.exec(`
             CREATE TABLE IF NOT EXISTS working_set (
                session_id TEXT,
                file_path TEXT,
                rank_score REAL, -- (Reads + Writes) * Decay
                last_accessed INTEGER,
                access_count INTEGER DEFAULT 1,
                PRIMARY KEY (session_id, file_path)
            );
        `);

        // Tier 2: Task Management
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                title TEXT,
                status TEXT, -- 'in_progress', 'completed', 'failed'
                context TEXT, -- JSON array of files
                created_at INTEGER,
                updated_at INTEGER
            );
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS subtasks (
                id TEXT PRIMARY KEY,
                task_id TEXT,
                text TEXT,
                done INTEGER DEFAULT 0, -- boolean
                position INTEGER
            );
        `);

        // Tier 3: Distillation & Autonomy
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS memos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                type TEXT NOT NULL,
                key TEXT,
                content TEXT NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            );
        `);

        // Vector Table for Semantic Search
        this.db.exec('DROP TABLE IF EXISTS vec_memos');
        this.db.exec(`
            CREATE VIRTUAL TABLE vec_memos USING vec0(
                embedding FLOAT[384]
            );
        `);

        // Migration logic
        import('./migrations.js').then(({ migrationManager }) => {
            migrationManager.run(this.db).catch(err => {
                console.error('Failed to run database migrations:', err);
            });
        });

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS scheduled_tasks ( -- OpenClaw "Heartbeat" Support
                id TEXT PRIMARY KEY,
                session_id TEXT,
                cron_expression TEXT, -- e.g. "0 9 * * *"
                command TEXT, -- "summarize_day"
                params TEXT, -- JSON parameters
                last_run_at INTEGER,
                active INTEGER DEFAULT 1
            );
        `);

        // Tier 4: Device State (Future Proofing)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS device_state ( -- Prep for PC Control
                session_id TEXT,
                meta_key TEXT, -- 'screen_size', 'active_window'
                meta_value TEXT,
                updated_at INTEGER
            );
        `);

        // Usage Stats (formerly usage.json)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS usage_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                model TEXT,
                input_tokens INTEGER,
                output_tokens INTEGER,
                cost REAL,
                timestamp INTEGER
            );
        `);

        // Event History (formerly history.json)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                type TEXT,
                content TEXT, -- JSON payload
                timestamp INTEGER
            );
        `);

        // Audit Log Table (for security tracking)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                action TEXT,
                details TEXT,
                timestamp INTEGER
            );
        `);

        // Performance Indexes
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_events_session_timestamp
                ON events(session_id, timestamp);
        `);

        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_working_set_session_rank
                ON working_set(session_id, rank_score DESC);
        `);

        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_tasks_session_status
                ON tasks(session_id, status);
        `);

        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_usage_stats_session
                ON usage_stats(session_id, timestamp);
        `);

        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_audit_log_session
                ON audit_log(session_id, timestamp);
        `);

        // Migration: Add params column to scheduled_tasks if it doesn't exist
        try {
            const columns = this.db.pragma('table_info(scheduled_tasks)') as any[];
            if (!columns.find(c => c.name === 'params')) {
                this.db.exec('ALTER TABLE scheduled_tasks ADD COLUMN params TEXT');
            }
        } catch (e) {
            console.error('Failed to run manual migration for scheduled_tasks:', e);
        }

        // Migration: Add workspace column to sessions if it doesn't exist
        try {
            const columns = this.db.pragma('table_info(sessions)') as any[];
            if (!columns.find(c => c.name === 'workspace')) {
                this.db.exec('ALTER TABLE sessions ADD COLUMN workspace TEXT');
            }
        } catch (e) {
            console.error('Failed to run manual migration for sessions:', e);
        }
    }

    public getDb(): Database.Database {
        return this.db;
    }

    public close() {
        this.db.close();
    }

    /**
     * Re-initialize the database connection (Useful for tests)
     */
    public reconnect(customPath?: string) {
        if (this.db) {
            try { this.db.close(); } catch { }
        }

        const targetPath = customPath || DB_PATH;
        const targetDir = path.dirname(targetPath);

        if (!existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
        }

        this.db = new Database(targetPath);
        this.db.pragma('journal_mode = WAL');
        this.initSchema();
    }
}

export const db = DatabaseManager.getInstance();
