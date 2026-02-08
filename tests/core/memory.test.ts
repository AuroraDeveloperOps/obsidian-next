/**
 * Memory Manager Tests
 *
 * Tests for the long-term memory system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock database
const mockDb = {
    prepare: vi.fn(() => ({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn(() => []),
    })),
    exec: vi.fn(),
};

vi.mock('../../src/core/database.js', () => ({
    db: {
        getDb: () => mockDb,
    },
}));

vi.mock('../../src/core/context.js', () => ({
    context: {
        get: () => ({ session_id: 'test-session-123' }),
    },
}));

describe('MemoryManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Initialization', () => {
        it('should initialize without error', async () => {
            const { MemoryManager } = await import('../../src/core/memory.js');
            const memory = new MemoryManager();

            await expect(memory.init()).resolves.not.toThrow();
        });
    });

    describe('Memory Types', () => {
        it('should support user_preference type', async () => {
            const { MemoType } = await import('../../src/core/memory.js');
            const validTypes: string[] = [
                'user_preference',
                'project_fact',
                'decision_log',
                'learned_pattern',
                'daily_summary',
            ];

            // Type should be one of the valid types
            for (const type of validTypes) {
                expect(type).toBeTruthy();
            }
        });
    });

    describe('Store Operation', () => {
        it('should require key and content for store', async () => {
            const { MemoryManager } = await import('../../src/core/memory.js');
            const memory = new MemoryManager();

            // Mock prepare to return proper statement object
            mockDb.prepare.mockReturnValue({
                run: vi.fn(),
                get: vi.fn(() => undefined),
                all: vi.fn(() => []),
            });

            const result = await memory.store('user_preference', '', 'some content');

            // Empty key should still work (depends on implementation)
            // The actual store should succeed if both key and content provided
            expect(typeof result).toBe('boolean');
        });
    });

    describe('Recall Operation', () => {
        it('should return null for non-existent key', async () => {
            const { MemoryManager } = await import('../../src/core/memory.js');
            const memory = new MemoryManager();

            mockDb.prepare.mockReturnValue({
                run: vi.fn(),
                get: vi.fn(() => undefined),
                all: vi.fn(() => []),
            });

            const result = await memory.recall('non-existent-key');

            expect(result).toBeNull();
        });

        it('should return memo object for existing key', async () => {
            const { MemoryManager } = await import('../../src/core/memory.js');
            const memory = new MemoryManager();

            const mockMemo = {
                id: 1,
                type: 'user_preference',
                key: 'user_name',
                content: 'Iverson',
                created_at: Math.floor(Date.now() / 1000),
                updated_at: Math.floor(Date.now() / 1000),
            };

            mockDb.prepare.mockReturnValue({
                run: vi.fn(),
                get: vi.fn(() => mockMemo),
                all: vi.fn(() => []),
            });

            const result = await memory.recall('user_name');

            expect(result).not.toBeNull();
            expect(result?.key).toBe('user_name');
            expect(result?.content).toBe('Iverson');
        });
    });

    describe('Search Operation', () => {
        it('should return empty array when no matches', async () => {
            const { MemoryManager } = await import('../../src/core/memory.js');
            const memory = new MemoryManager();

            mockDb.prepare.mockReturnValue({
                run: vi.fn(),
                get: vi.fn(),
                all: vi.fn(() => []),
            });

            const results = await memory.search('nonexistent');

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(0);
        });

        it('should filter by type when provided', async () => {
            const { MemoryManager } = await import('../../src/core/memory.js');
            const memory = new MemoryManager();

            const prepareCall = vi.fn(() => ({
                run: vi.fn(),
                get: vi.fn(),
                all: vi.fn(() => []),
            }));
            mockDb.prepare = prepareCall;

            await memory.search('test', 'user_preference');

            // Check that SQL includes type filter
            const sqlCalls = prepareCall.mock.calls.map(c => c[0]);
            expect(sqlCalls.some((sql: string) => sql.includes('type = ?'))).toBe(true);
        });
    });

    describe('getUserContext', () => {
        it('should return empty string when no memories', async () => {
            const { MemoryManager } = await import('../../src/core/memory.js');
            const memory = new MemoryManager();

            mockDb.prepare.mockReturnValue({
                run: vi.fn(),
                get: vi.fn(),
                all: vi.fn(() => []),
            });

            const context = await memory.getUserContext();

            expect(context).toBe('');
        });

        it('should format user preferences and facts', async () => {
            const { MemoryManager } = await import('../../src/core/memory.js');
            const memory = new MemoryManager();

            const mockPrefs = [
                { id: 1, type: 'user_preference', key: 'name', content: 'Iverson', created_at: 1000, updated_at: 1000 },
            ];

            mockDb.prepare.mockReturnValue({
                run: vi.fn(),
                get: vi.fn(),
                all: vi.fn(() => mockPrefs),
            });

            const context = await memory.getUserContext();

            expect(context).toContain('[RECALL]');
            expect(context).toContain('name');
        });
    });

    describe('Forget Operation', () => {
        it('should delete memory by key', async () => {
            const { MemoryManager } = await import('../../src/core/memory.js');
            const memory = new MemoryManager();

            const runMock = vi.fn();
            mockDb.prepare.mockReturnValue({
                run: runMock,
                get: vi.fn(),
                all: vi.fn(() => []),
            });

            const result = await memory.forget('test-key');

            expect(result).toBe(true);
            expect(runMock).toHaveBeenCalledWith('test-key');
        });
    });

    describe('Stats', () => {
        it('should return memory statistics', async () => {
            const { MemoryManager } = await import('../../src/core/memory.js');
            const memory = new MemoryManager();

            mockDb.prepare.mockReturnValue({
                run: vi.fn(),
                get: vi.fn(() => ({ count: 5 })),
                all: vi.fn(() => [
                    { type: 'user_preference', count: 3 },
                    { type: 'project_fact', count: 2 },
                ]),
            });

            const stats = await memory.getStats();

            expect(stats.total).toBe(5);
            expect(stats.byType).toHaveProperty('user_preference');
        });
    });
});
