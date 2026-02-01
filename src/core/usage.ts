import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { z } from 'zod';

const UsageSchema = z.object({
    totalSessions: z.number().default(0),
    totalRequests: z.number().default(0),
    totalInputTokens: z.number().default(0),
    totalOutputTokens: z.number().default(0),
    // Cache metrics
    totalCacheReadTokens: z.number().default(0),
    totalCacheCreationTokens: z.number().default(0),
    totalCost: z.number().default(0),
});

export type UsageStats = z.infer<typeof UsageSchema>;

const MODEL_PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
    // Claude 4.5 Family (2025-2026)
    'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
    'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00, cacheRead: 0.10, cacheWrite: 1.25 },
    'claude-opus-4-5-20251101': { input: 5.00, output: 25.00, cacheRead: 0.50, cacheWrite: 6.25 },
    // Claude 3.5 Family
    'claude-3-5-sonnet': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
    'claude-3-5-haiku': { input: 0.25, output: 1.25, cacheRead: 0.03, cacheWrite: 0.30 }, // Estimated
    'claude-3-haiku': { input: 0.25, output: 1.25, cacheRead: 0.03, cacheWrite: 0.30 },
    'claude-3-opus': { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 }, // Estimated
    'claude-3-sonnet': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
};

const CONTEXT_WINDOW_SIZES: Record<string, number> = {
    'claude-sonnet-4-5-20250929': 200_000,
    'claude-haiku-4-5-20251001': 200_000,
    'claude-opus-4-5-20251101': 200_000,
    'claude-3-5-sonnet': 200_000,
    'claude-3-5-haiku': 200_000,
};

export class UsageTracker {
    private usagePath: string;
    private stats: UsageStats;
    private sessionCost: number = 0;
    private sessionInputTokens: number = 0;
    private sessionOutputTokens: number = 0;
    private sessionCacheReadTokens: number = 0;
    private sessionCacheCreationTokens: number = 0;
    private sessionDuration: number = 0;
    private lastContextSize: number = 0;
    private lastCacheRead: number = 0;
    private lastCacheCreation: number = 0;

    constructor(customPath?: string) {
        this.usagePath = customPath || path.join(os.homedir(), '.obsidian', 'usage.json');
        this.stats = UsageSchema.parse({});
    }
    async init() {
        try {
            const data = await fs.readFile(this.usagePath, 'utf-8');
            this.stats = UsageSchema.parse(JSON.parse(data));
        } catch {
            await this.save();
        }
    }

    async track(model: string, input: number, output: number, cacheRead: number = 0, cacheCreation: number = 0, contextSize?: number) {
        let prices = MODEL_PRICES[model];
        if (!prices) {
            const key = Object.keys(MODEL_PRICES).find(k => model.includes(k));
            prices = key ? MODEL_PRICES[key] : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
        }

        // Cost Calculation:
        // Input tokens are standard input usage (non-cached).
        // Cache Read tokens are cheaper.
        // Cache Creation tokens are usually Input + a premium (or just treated as Input).
        // Anthropic billing treats 'input' tokens as either 'base input', 'cache read', or 'cache creation'.
        // Assuming 'input' arg passed here is the total input count reported by standard usage, we might need to split it if the API provides breakdown.
        // However, usually API returns: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens.
        // And 'input_tokens' EXCLUDES the cache ones, or INCLUDES?
        // Anthropic docs: usage.input_tokens is total? No.
        // Usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 100 }

        // We will assume arguments are distinct.

        const costInput = (input / 1_000_000 * prices.input);
        const costOutput = (output / 1_000_000 * prices.output);
        const costCacheRead = (cacheRead / 1_000_000 * prices.cacheRead);
        const costCacheWrite = (cacheCreation / 1_000_000 * prices.cacheWrite);

        const totalReqCost = costInput + costOutput + costCacheRead + costCacheWrite;

        this.stats.totalRequests++;
        this.stats.totalInputTokens += input;
        this.stats.totalOutputTokens += output;
        this.stats.totalCacheReadTokens += cacheRead;
        this.stats.totalCacheCreationTokens += cacheCreation;
        this.stats.totalCost += totalReqCost;

        // Session tracking
        this.sessionCost += totalReqCost;
        this.sessionInputTokens += input;
        this.sessionOutputTokens += output;
        this.sessionCacheReadTokens += cacheRead;
        this.sessionCacheCreationTokens += cacheCreation;

        // Use explicit context size if provided (correct for tool loops), otherwise fallback to sum
        // Note: input usually includes cacheCreation, so we don't add cacheCreation here to avoid double counting if input is total.
        this.lastContextSize = contextSize !== undefined ? contextSize : (input + cacheRead);
        this.lastCacheRead = cacheRead;
        this.lastCacheCreation = cacheCreation;

        await this.save();
    }

    getSessionCost(): number {
        return this.sessionCost;
    }

    getSessionTokens() {
        return {
            input: this.sessionInputTokens,
            output: this.sessionOutputTokens,
            cacheRead: this.sessionCacheReadTokens,
            cacheCreation: this.sessionCacheCreationTokens,
            total: this.sessionInputTokens + this.sessionOutputTokens + this.sessionCacheReadTokens + this.sessionCacheCreationTokens
        };
    }

    addSessionDuration(ms: number) {
        this.sessionDuration += ms;
    }

    getSessionDuration(): number {
        return this.sessionDuration;
    }

    getContextUsage(model: string) {
        let limit = 200_000;
        if (CONTEXT_WINDOW_SIZES[model]) {
            limit = CONTEXT_WINDOW_SIZES[model];
        } else {
            const key = Object.keys(CONTEXT_WINDOW_SIZES).find(k => model.includes(k));
            if (key) limit = CONTEXT_WINDOW_SIZES[key];
        }

        const used = this.lastContextSize;
        // Approximation: System/Tools are either Read from cache OR Created in cache (on miss)
        // This helps the UI showing "System/Tools" even on cache miss.
        const cached = this.lastCacheRead + this.lastCacheCreation;
        const remaining = Math.max(0, limit - used);
        const percentUsed = (used / limit) * 100;

        return {
            used,
            cached,
            limit,
            remaining,
            percentRemaining: 100 - percentUsed
        };
    }

    async trackSession() {
        this.stats.totalSessions++;
        await this.save();
    }

    getStats(): UsageStats {
        return this.stats;
    }

    private async save() {
        const dir = path.dirname(this.usagePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(this.usagePath, JSON.stringify(this.stats, null, 2));
    }

    /**
     * Restore session-specific stats from a saved session
     */
    restoreSessionState(stats: {
        cost: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheCreationTokens: number;
        duration: number;
    }) {
        this.sessionCost = stats.cost;
        this.sessionInputTokens = stats.inputTokens;
        this.sessionOutputTokens = stats.outputTokens;
        this.sessionCacheReadTokens = stats.cacheReadTokens;
        this.sessionCacheCreationTokens = stats.cacheCreationTokens;
        this.sessionDuration = stats.duration;

        // Restore context visualizer state (approximate)
        this.lastContextSize = stats.inputTokens + stats.cacheReadTokens + stats.cacheCreationTokens;
        this.lastCacheRead = stats.cacheReadTokens;
    }
}

export const usage = new UsageTracker();
