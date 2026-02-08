/**
 * Usage Tracker Tests
 *
 * Comprehensive tests for:
 * - Token tracking (input, output, cache)
 * - Cost calculation
 * - Context usage monitoring
 * - Cache hit rate metrics
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock database
const mockDb = {
    prepare: vi.fn(() => ({
        run: vi.fn(),
        get: vi.fn(() => ({
            totalInputTokens: 10000,
            totalOutputTokens: 5000,
            totalCacheReadTokens: 8000,
            totalCacheCreationTokens: 2000,
            totalCost: 0.15,
            totalRequests: 10,
            totalSessions: 3,
        })),
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

describe('UsageTracker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Token Tracking', () => {
        it('should track input and output tokens', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            await tracker.track('claude-sonnet-4-5-20250929', 1000, 500);
            const tokens = tracker.getSessionTokens();

            expect(tokens.input).toBe(1000);
            expect(tokens.output).toBe(500);
        });

        it('should track cache tokens', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            await tracker.track('claude-sonnet-4-5-20250929', 1000, 500, 800, 200);
            const tokens = tracker.getSessionTokens();

            expect(tokens.cacheRead).toBe(800);
            expect(tokens.cacheCreation).toBe(200);
        });

        it('should accumulate tokens across multiple calls', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            await tracker.track('claude-sonnet-4-5-20250929', 1000, 500, 800, 200);
            await tracker.track('claude-sonnet-4-5-20250929', 2000, 1000, 1600, 0);
            const tokens = tracker.getSessionTokens();

            expect(tokens.input).toBe(3000);
            expect(tokens.output).toBe(1500);
            expect(tokens.cacheRead).toBe(2400);
            expect(tokens.cacheCreation).toBe(200);
        });
    });

    describe('Cost Calculation', () => {
        it('should calculate cost for Sonnet 4.5', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            // 1M input tokens at $3, 1M output at $15
            // So 1000 input = $0.003, 500 output = $0.0075
            await tracker.track('claude-sonnet-4-5-20250929', 1000, 500, 0, 0);
            const cost = tracker.getSessionCost();

            // Cost should be approximately $0.0105
            expect(cost).toBeGreaterThan(0);
            expect(cost).toBeLessThan(0.02);
        });

        it('should include cache cost in calculation', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            // With cache reads at $0.30/MTok, cache writes at $3.75/MTok
            await tracker.track('claude-sonnet-4-5-20250929', 1000, 500, 10000, 5000);
            const cost = tracker.getSessionCost();

            // Should include cache costs
            expect(cost).toBeGreaterThan(0.01);
        });

        it('should handle unknown model gracefully', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            await tracker.track('unknown-model', 1000, 500);
            const cost = tracker.getSessionCost();

            // Should not throw, cost may be 0 for unknown model
            expect(typeof cost).toBe('number');
        });
    });

    describe('Context Usage', () => {
        it('should report context usage for known models', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            await tracker.track('claude-sonnet-4-5-20250929', 50000, 5000, 10000, 5000, 60000);
            const ctx = tracker.getContextUsage('claude-sonnet-4-5-20250929');

            expect(ctx.used).toBe(60000);
            expect(ctx.limit).toBe(200000);
            expect(ctx.remaining).toBe(140000);
            expect(ctx.percentRemaining).toBe(70);
        });

        it('should default to 200k limit for unknown models', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            const ctx = tracker.getContextUsage('unknown-model');

            expect(ctx.limit).toBe(200000);
        });

        it('should track cached tokens in context', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            await tracker.track('claude-sonnet-4-5-20250929', 5000, 1000, 20000, 3000, 25000);
            const ctx = tracker.getContextUsage('claude-sonnet-4-5-20250929');

            expect(ctx.cached).toBe(23000); // cacheRead + cacheCreation
        });
    });

    describe('Cache Hit Rate', () => {
        it('should calculate cache hit rate', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            // 8000 cache read out of 10000 total input tokens = 80% hit rate
            await tracker.track('claude-sonnet-4-5-20250929', 2000, 500, 8000, 0);
            const cacheStats = tracker.getCacheHitRate();

            expect(cacheStats.hitRate).toBe(80);
            expect(cacheStats.totalCached).toBe(8000);
            expect(cacheStats.totalInput).toBe(10000); // 2000 + 8000 + 0
        });

        it('should handle zero tokens', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            const cacheStats = tracker.getCacheHitRate();

            expect(cacheStats.hitRate).toBe(0);
            expect(cacheStats.totalCached).toBe(0);
        });
    });

    describe('Session State', () => {
        it('should restore session state', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            tracker.restoreSessionState({
                cost: 0.5,
                inputTokens: 10000,
                outputTokens: 5000,
                cacheReadTokens: 8000,
                cacheCreationTokens: 2000,
                duration: 60000,
            });

            const cost = tracker.getSessionCost();
            const tokens = tracker.getSessionTokens();
            const duration = tracker.getSessionDuration();

            expect(cost).toBe(0.5);
            expect(tokens.input).toBe(10000);
            expect(tokens.output).toBe(5000);
            expect(tokens.cacheRead).toBe(8000);
            expect(tokens.cacheCreation).toBe(2000);
            expect(duration).toBe(60000);
        });

        it('should track session duration', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            tracker.addSessionDuration(5000);
            tracker.addSessionDuration(3000);
            const duration = tracker.getSessionDuration();

            expect(duration).toBe(8000);
        });
    });

    describe('Aggregate Stats', () => {
        it('should return aggregate statistics', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            const stats = tracker.getStats();

            expect(stats.totalInputTokens).toBe(10000);
            expect(stats.totalOutputTokens).toBe(5000);
            expect(stats.totalCacheReadTokens).toBe(8000);
            expect(stats.totalCacheCreationTokens).toBe(2000);
            expect(stats.totalCost).toBe(0.15);
            expect(stats.totalRequests).toBe(10);
            expect(stats.totalSessions).toBe(3);
        });
    });

    describe('Database Persistence', () => {
        it('should insert usage record to database', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            const runMock = vi.fn();
            mockDb.prepare.mockReturnValue({
                run: runMock,
                get: vi.fn(),
                all: vi.fn(),
            });

            await tracker.track('claude-sonnet-4-5-20250929', 1000, 500, 800, 200);

            // Should have called prepare with INSERT statement
            const prepareCalls = mockDb.prepare.mock.calls.map(c => c[0]);
            expect(prepareCalls.some((sql: string) => sql.includes('INSERT INTO usage_stats'))).toBe(true);

            // Should have called run with the values
            expect(runMock).toHaveBeenCalled();
        });

        it('should include cache tokens in database insert', async () => {
            const { UsageTracker } = await import('../../src/core/usage.js');
            const tracker = new UsageTracker();

            const runMock = vi.fn();
            mockDb.prepare.mockReturnValue({
                run: runMock,
                get: vi.fn(),
                all: vi.fn(),
            });

            await tracker.track('claude-sonnet-4-5-20250929', 1000, 500, 800, 200);

            // Check that run was called with cache token values
            const runArgs = runMock.mock.calls[0];
            expect(runArgs).toContain(800); // cache_read_tokens
            expect(runArgs).toContain(200); // cache_creation_tokens
        });
    });
});
