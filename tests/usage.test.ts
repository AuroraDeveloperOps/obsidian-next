import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UsageTracker } from '../src/core/usage.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'obsidian-next-usage-test');
const TEST_USAGE_PATH = path.join(TEST_DIR, 'usage.json');

describe('UsageTracker', () => {
    let tracker: UsageTracker;

    beforeEach(async () => {
        await fs.mkdir(TEST_DIR, { recursive: true });
        tracker = new UsageTracker(TEST_USAGE_PATH);
    });

    afterEach(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    it('should initialize with zeros if no file exists', async () => {
        await tracker.init();
        const stats = tracker.getStats();
        expect(stats.totalCost).toBe(0);
        expect(stats.totalInputTokens).toBe(0);
    });

    it('should track usage and calculate cost', async () => {
        await tracker.init();
        // Claude 3.5 Sonnet: $3 input / $15 output
        // 1M input / 1M output
        await tracker.track('claude-3-5-sonnet-20240620', 1_000_000, 1_000_000);

        const stats = tracker.getStats();
        expect(stats.totalInputTokens).toBe(1_000_000);
        expect(stats.totalOutputTokens).toBe(1_000_000);
        expect(stats.totalCost).toBeCloseTo(3 + 15);
    });

    it('should persist stats to disk', async () => {
        await tracker.init();
        await tracker.track('claude-3-haiku-20240307', 1000, 1000);

        // check file
        const content = await fs.readFile(TEST_USAGE_PATH, 'utf-8');
        const data = JSON.parse(content);
        expect(data.totalInputTokens).toBe(1000);
    });
});
