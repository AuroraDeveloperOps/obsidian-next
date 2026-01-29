import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { z } from 'zod';

const UsageSchema = z.object({
    totalSessions: z.number().default(0),
    totalRequests: z.number().default(0),
    totalInputTokens: z.number().default(0),
    totalOutputTokens: z.number().default(0),
    totalCost: z.number().default(0),
});

export type UsageStats = z.infer<typeof UsageSchema>;

const MODEL_PRICES: Record<string, { input: number; output: number }> = {
    // Claude 4.5 Family (2025-2026)
    'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 }, // $3 / $15
    'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },   // $1 / $5
    'claude-opus-4-5-20251101': { input: 5.00, output: 25.00 },   // $5 / $25
};

export class UsageTracker {
    private usagePath: string;
    private stats: UsageStats;

    constructor(customPath?: string) {
        this.usagePath = customPath || path.join(os.homedir(), '.obsidian', 'usage.json');
        this.stats = UsageSchema.parse({});
    }

    async init() {
        try {
            const data = await fs.readFile(this.usagePath, 'utf-8');
            this.stats = UsageSchema.parse(JSON.parse(data));
        } catch {
            // No history or invalid, start fresh
            await this.save();
        }
    }

    async track(model: string, input: number, output: number) {
        // Calculate cost
        let prices = MODEL_PRICES[model];
        if (!prices) {
            // Attempt partial match
            const key = Object.keys(MODEL_PRICES).find(k => model.includes(k));
            prices = key ? MODEL_PRICES[key] : { input: 0, output: 0 };
        }

        const cost = (input / 1_000_000 * prices.input) + (output / 1_000_000 * prices.output);

        this.stats.totalRequests++;
        this.stats.totalInputTokens += input;
        this.stats.totalOutputTokens += output;
        this.stats.totalCost += cost;

        await this.save();
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
}

export const usage = new UsageTracker();
