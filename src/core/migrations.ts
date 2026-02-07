import { Database } from 'better-sqlite3';
import { bus } from './bus.js';

export interface Migration {
    version: number;
    description: string;
    up: (db: Database) => void;
}

export class MigrationManager {
    private migrations: Migration[] = [
        {
            version: 1,
            description: 'Update memos table schema with id, key, and updated_at',
            up: (db: Database) => {
                // Check if key column exists
                const tableInfo = db.prepare("PRAGMA table_info(memos)").all() as any[];
                const hasKey = tableInfo.some(col => col.name === 'key');
                const hasId = tableInfo.some(col => col.name === 'id');

                if (hasKey && hasId) {
                    return; // Already migrated or correct from start
                }

                bus.emitAgent({ type: 'thought', content: '[Migration] Updating memos table schema...', hidden: true });

                // SQLite safe migration pattern:
                // 1. Rename old table
                db.exec('ALTER TABLE memos RENAME TO memos_old');

                // 2. Create new table
                db.exec(`
                    CREATE TABLE memos (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT,
                        type TEXT NOT NULL,
                        key TEXT,
                        content TEXT NOT NULL,
                        created_at INTEGER DEFAULT (strftime('%s', 'now')),
                        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
                    );
                `);

                // 3. Copy data (mapping existing columns)
                // Note: key wasn't in original schema, so we'll leave it NULL or try to extract from content if we were fancy, 
                // but usually legacy data didn't have keys.
                db.exec(`
                    INSERT INTO memos (session_id, type, content, created_at, updated_at)
                    SELECT session_id, type, content, created_at, created_at
                    FROM memos_old;
                `);

                // 4. Drop old table
                db.exec('DROP TABLE memos_old');

                // 5. Re-create indexes
                db.exec('CREATE INDEX IF NOT EXISTS idx_memos_type_key ON memos(type, key);');
                db.exec('CREATE INDEX IF NOT EXISTS idx_memos_session ON memos(session_id);');

                bus.emitAgent({ type: 'thought', content: '[Migration] Memos table updated successfully.', hidden: true });
            }
        },
        {
            version: 2,
            description: 'Add cache token tracking columns to usage_stats',
            up: (db: Database) => {
                const tableInfo = db.prepare("PRAGMA table_info(usage_stats)").all() as any[];
                const hasCacheRead = tableInfo.some(col => col.name === 'cache_read_tokens');
                const hasCacheCreation = tableInfo.some(col => col.name === 'cache_creation_tokens');

                if (!hasCacheRead) {
                    db.exec('ALTER TABLE usage_stats ADD COLUMN cache_read_tokens INTEGER DEFAULT 0');
                }
                if (!hasCacheCreation) {
                    db.exec('ALTER TABLE usage_stats ADD COLUMN cache_creation_tokens INTEGER DEFAULT 0');
                }

                bus.emitAgent({ type: 'thought', content: '[Migration] Added cache token columns to usage_stats.', hidden: true });
            }
        },
        {
            version: 3,
            description: 'Add session permissions tracking table',
            up: (db: Database) => {
                db.exec(`
                    CREATE TABLE IF NOT EXISTS session_permissions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        permission_type TEXT NOT NULL, -- 'tool', 'path', 'command'
                        permission_key TEXT NOT NULL, -- tool name, path pattern, or command pattern
                        allowed INTEGER NOT NULL DEFAULT 1, -- 1 = allowed, 0 = denied
                        scope TEXT NOT NULL DEFAULT 'session', -- 'session' or 'persistent'
                        bypass_sandbox INTEGER DEFAULT 0,
                        created_at INTEGER DEFAULT (strftime('%s', 'now')),
                        UNIQUE(session_id, permission_type, permission_key)
                    );
                `);
                db.exec('CREATE INDEX IF NOT EXISTS idx_session_permissions ON session_permissions(session_id, permission_type);');

                bus.emitAgent({ type: 'thought', content: '[Migration] Added session_permissions table.', hidden: true });
            }
        },
        {
            version: 4,
            description: 'Add memory graph support: relationships and temporal decay',
            up: (db: Database) => {
                // Create memo_relations table for tracking relationships between memos
                db.exec(`
                    CREATE TABLE IF NOT EXISTS memo_relations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        source_id INTEGER NOT NULL,
                        target_id INTEGER NOT NULL,
                        relation_type TEXT NOT NULL, -- 'related_to', 'derived_from', 'supersedes', 'contradicts'
                        strength REAL DEFAULT 1.0, -- relationship strength 0.0-1.0
                        created_at INTEGER DEFAULT (strftime('%s', 'now')),
                        FOREIGN KEY (source_id) REFERENCES memos(id) ON DELETE CASCADE,
                        FOREIGN KEY (target_id) REFERENCES memos(id) ON DELETE CASCADE,
                        UNIQUE(source_id, target_id, relation_type)
                    );
                `);
                db.exec('CREATE INDEX IF NOT EXISTS idx_memo_relations_source ON memo_relations(source_id);');
                db.exec('CREATE INDEX IF NOT EXISTS idx_memo_relations_target ON memo_relations(target_id);');

                // Add temporal decay columns to memos table
                const tableInfo = db.prepare("PRAGMA table_info(memos)").all() as any[];
                const hasAccessCount = tableInfo.some(col => col.name === 'access_count');
                const hasLastAccessed = tableInfo.some(col => col.name === 'last_accessed');

                if (!hasAccessCount) {
                    db.exec('ALTER TABLE memos ADD COLUMN access_count INTEGER DEFAULT 0');
                }
                if (!hasLastAccessed) {
                    // SQLite doesn't allow non-constant defaults in ALTER TABLE
                    // Use NULL as default, will be set on first access
                    db.exec('ALTER TABLE memos ADD COLUMN last_accessed INTEGER DEFAULT NULL');
                }

                bus.emitAgent({ type: 'thought', content: '[Migration] Added memory graph support: relations table and temporal decay columns.', hidden: true });
            }
        }
    ];

    async run(db: Database): Promise<void> {
        // Ensure migration tracking table exists
        db.exec(`
            CREATE TABLE IF NOT EXISTS _migrations (
                version INTEGER PRIMARY KEY,
                description TEXT,
                applied_at INTEGER DEFAULT (strftime('%s', 'now'))
            );
        `);

        const applied = db.prepare('SELECT version FROM _migrations').all() as { version: number }[];
        const appliedVersions = new Set(applied.map(m => m.version));

        // Sort migrations by version
        const pending = this.migrations
            .filter(m => !appliedVersions.has(m.version))
            .sort((a, b) => a.version - b.version);

        for (const migration of pending) {
            try {
                // Use transaction for each migration
                const transaction = db.transaction(() => {
                    migration.up(db);
                    db.prepare('INSERT INTO _migrations (version, description) VALUES (?, ?)').run(migration.version, migration.description);
                });
                transaction();
            } catch (error: any) {
                console.error(`Migration ${migration.version} failed:`, error);
                throw error;
            }
        }
    }
}

export const migrationManager = new MigrationManager();
