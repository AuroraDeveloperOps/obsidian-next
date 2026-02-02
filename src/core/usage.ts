import { db } from './database.js';
import { context } from './context.js';
import { z } from 'zod';

const UsageSchema = z.object({
    totalSessions: z.number().default(0),
    totalRequests: z.number().default(0),
    totalInputTokens: z.number().default(0),
    totalOutputTokens: z.number().default(0),
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
    'claude-3-5-haiku': { input: 0.25, output: 1.25, cacheRead: 0.03, cacheWrite: 0.30 },
    'claude-3-haiku': { input: 0.25, output: 1.25, cacheRead: 0.03, cacheWrite: 0.30 },
    'claude-3-opus': { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
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
    // In-memory session stats (for quick access/display)
    private sessionCost: number = 0;
    private sessionInputTokens: number = 0;
    private sessionOutputTokens: number = 0;
    private sessionCacheReadTokens: number = 0;
    private sessionCacheCreationTokens: number = 0;
    private sessionDuration: number = 0;
    private lastContextSize: number = 0;
    private lastCacheRead: number = 0;
    private lastCacheCreation: number = 0;

    constructor() { }

    async init() {
        // No-op: DB is initialized in database.ts
    }

    async track(model: string, input: number, output: number, cacheRead: number = 0, cacheCreation: number = 0, contextSize?: number) {
        let prices = MODEL_PRICES[model];
        if (!prices) {
            const key = Object.keys(MODEL_PRICES).find(k => model.includes(k));
            prices = key ? MODEL_PRICES[key] : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
        }

        const costInput = (input / 1_000_000 * prices.input);
        const costOutput = (output / 1_000_000 * prices.output);
        const costCacheRead = (cacheRead / 1_000_000 * prices.cacheRead);
        const costCacheWrite = (cacheCreation / 1_000_000 * prices.cacheWrite);
        const totalReqCost = costInput + costOutput + costCacheRead + costCacheWrite;

        // DB Insert
        try {
            const currentSessionId = context.get().session_id; // Dynamic fetch to avoid storage loop
            db.getDb().prepare(`
                INSERT INTO usage_stats (session_id, model, input_tokens, output_tokens, cost, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(currentSessionId, model, input, output, totalReqCost, Date.now());
        } catch (e) {
            console.error('Failed to log usage to DB:', e);
        }

        // Session tracking (Memory)
        this.sessionCost += totalReqCost;
        this.sessionInputTokens += input;
        this.sessionOutputTokens += output;
        this.sessionCacheReadTokens += cacheRead;
        this.sessionCacheCreationTokens += cacheCreation;

        this.lastContextSize = contextSize !== undefined ? contextSize : (input + cacheRead);
        this.lastCacheRead = cacheRead;
        this.lastCacheCreation = cacheCreation;
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
        // Implicitly tracked via usage_stats, but we could update a sessions table count if needed.
        // For now, this is a no-op as the DB has individual records.
    }

    getStats(): UsageStats {
        // Query aggregate stats from DB
        try {
            const result = db.getDb().prepare(`
                SELECT 
                    SUM(input_tokens) as totalInputTokens,
                    SUM(output_tokens) as totalOutputTokens,
                    SUM(cost) as totalCost,
                    COUNT(*) as totalRequests
                FROM usage_stats
            `).get() as any;

            return {
                totalSessions: 0, // Need to count distinct session_ids
                totalRequests: result.totalRequests || 0,
                totalInputTokens: result.totalInputTokens || 0,
                totalOutputTokens: result.totalOutputTokens || 0,
                totalCacheReadTokens: 0, // TODO: Add column if needed
                totalCacheCreationTokens: 0,
                totalCost: result.totalCost || 0,
            };
        } catch (e) {
            return UsageSchema.parse({});
        }
    }

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
        this.lastContextSize = stats.inputTokens + stats.cacheReadTokens + stats.cacheCreationTokens;
        this.lastCacheRead = stats.cacheReadTokens;
    }
}

export const usage = new UsageTracker();
