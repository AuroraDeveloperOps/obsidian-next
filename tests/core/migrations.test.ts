import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MigrationManager } from '../../src/core/migrations.js';

// Mock bus
vi.mock('../../src/core/bus.js', () => ({
    bus: {
        emitAgent: vi.fn(),
    },
}));

describe('MigrationManager', () => {
    let mockDb: any;
    let migrationManager: MigrationManager;

    beforeEach(() => {
        vi.clearAllMocks();
        migrationManager = new MigrationManager();

        // Create a fake database mock that can track schema changes
        const tables: Record<string, any[]> = {
            memos: [
                { name: 'session_id' },
                { name: 'type' },
                { name: 'content' },
                { name: 'created_at' }
            ]
        };

        mockDb = {
            prepare: vi.fn((sql) => {
                if (sql === "PRAGMA table_info(memos)") {
                    return {
                        all: () => tables.memos
                    };
                }
                if (sql === 'SELECT version FROM _migrations') {
                    return {
                        all: () => [] // No migrations applied yet
                    };
                }
                return {
                    run: vi.fn(),
                    all: vi.fn(() => []),
                    get: vi.fn(),
                };
            }),
            exec: vi.fn((sql) => {
                // Track table renames and creations in our mock
                if (sql.includes('ALTER TABLE memos RENAME TO memos_old')) {
                    tables.memos_old = [...tables.memos];
                    delete tables.memos;
                }
                if (sql.includes('CREATE TABLE memos')) {
                    tables.memos = [
                        { name: 'id' },
                        { name: 'session_id' },
                        { name: 'type' },
                        { name: 'key' },
                        { name: 'content' },
                        { name: 'created_at' },
                        { name: 'updated_at' }
                    ];
                }
            }),
            transaction: vi.fn((cb) => cb),
        };
    });

    it('should run pending migrations', async () => {
        await migrationManager.run(mockDb);

        // Check if tracking table was created
        expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS _migrations'));

        // Check if migration 1 was applied
        expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('ALTER TABLE memos RENAME TO memos_old'));
        expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE memos'));
        expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO memos'));

        // Final expectation: memos should now have its columns in our mock tracker
        const tableInfo = mockDb.prepare("PRAGMA table_info(memos)").all();
        expect(tableInfo.some((c: any) => c.name === 'key')).toBe(true);
        expect(tableInfo.some((c: any) => c.name === 'id')).toBe(true);
    });

    it('should skip already applied migrations', async () => {
        mockDb.prepare = vi.fn((sql) => {
            if (sql === 'SELECT version FROM _migrations') {
                return {
                    all: () => [{ version: 1 }] // Migration 1 already applied
                };
            }
            return {
                run: vi.fn(),
                all: vi.fn(() => []),
                get: vi.fn(),
            };
        });

        await migrationManager.run(mockDb);

        // Should NOT call migration 1 logic
        expect(mockDb.exec).not.toHaveBeenCalledWith(expect.stringContaining('ALTER TABLE memos RENAME TO memos_old'));
    });
});
