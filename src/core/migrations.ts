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
