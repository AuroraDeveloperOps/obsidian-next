import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

const DB_DIR = path.join(process.cwd(), '.obsidian');
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
            CREATE TABLE IF NOT EXISTS memos ( -- The "Handoff" Layer
                session_id TEXT,
                type TEXT, -- 'daily_summary', 'decision_log', 'user_preference'
                content TEXT,
                created_at INTEGER
            );
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS scheduled_tasks ( -- OpenClaw "Heartbeat" Support
                id TEXT PRIMARY KEY,
                session_id TEXT,
                cron_expression TEXT, -- e.g. "0 9 * * *"
                command TEXT, -- "summarize_day"
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
