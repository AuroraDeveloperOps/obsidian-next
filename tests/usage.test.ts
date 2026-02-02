import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UsageTracker } from '../src/core/usage.js';
import { db } from '../src/core/database.js';
import { context } from '../src/core/context.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'obsidian-next-usage-test');
const TEST_USAGE_PATH = path.join(TEST_DIR, 'usage.json');

describe('UsageTracker', () => {
    let tracker: UsageTracker;

    beforeEach(async () => {
        // Use in-memory DB for speed and isolation
        db.reconnect(':memory:');

        // Context is required for session_id
        await context.init();

        tracker = new UsageTracker();
        await tracker.init();
    });

    afterEach(async () => {
        db.close();
    });

    it('should initialize with zeros if no data exists', async () => {
        const stats = tracker.getStats();
        expect(stats.totalCost).toBe(0);
        expect(stats.totalInputTokens).toBe(0);
    });

    it('should track usage and calculate cost', async () => {
        // Claude 3.5 Sonnet: $3 input / $15 output
        // 1M input / 1M output
        await tracker.track('claude-3-5-sonnet-20240620', 1_000_000, 1_000_000);

        const stats = tracker.getStats();
        expect(stats.totalInputTokens).toBe(1_000_000);
        expect(stats.totalOutputTokens).toBe(1_000_000);
        expect(stats.totalCost).toBeCloseTo(3 + 15);
    });

    it('should persist stats to db', async () => {
        const sessionId = context.get().session_id;
        await tracker.track('claude-3-haiku-20240307', 1000, 1000);

        // Check DB directly
        const row = db.getDb().prepare('SELECT * FROM usage_stats WHERE session_id = ?').get(sessionId) as any;
        expect(row).toBeDefined();
        expect(row.input_tokens).toBe(1000);
        expect(row.output_tokens).toBe(1000);
    });
});
