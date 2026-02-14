/**
 * AI Stress Test Framework
 *
 * Real API integration tests for the LLM client.
 * These tests make actual API calls to Anthropic and will incur costs.
 *
 * Run with: npm test -- --run tests/manual/stress-test.test.ts
 *
 * Environment: Requires ANTHROPIC_API_KEY in keychain or environment
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('AI Stress Tests', () => {
    let llm: any;
    let startTime: number;
    let apiKeyAvailable = false;

    beforeAll(async () => {
        // Try to load API key from keychain via keyManager
        const { keyManager } = await import('../../src/core/keyManager.js');
        const key = await keyManager.loadKey();

        if (!key) {
            console.log('[STRESS TEST] Skipping: No API key found in keychain or environment');
            return;
        }

        apiKeyAvailable = true;

        const llmModule = await import('../../src/core/llm/index.js');
        llm = llmModule.llm;
        startTime = Date.now();
    });

    afterAll(() => {
        if (apiKeyAvailable) {
            const duration = Date.now() - startTime;
            console.log(`\n[STRESS TEST] Total duration: ${(duration / 1000).toFixed(2)}s`);
        }
    });

    describe('Basic Response', () => {
        it('should get a simple response from the LLM', async () => {
            if (!apiKeyAvailable) return;

            const response = await llm.streamChat('Say "hello" and nothing else.');

            expect(response).toBeDefined();
            expect(response.toLowerCase()).toContain('hello');
        }, 30000);
    });

    describe('Tool Usage', () => {
        it('should handle tool request in response', async () => {
            if (!apiKeyAvailable) return;

            // This tests if the LLM correctly formats tool calls
            // Note: streamChat may return empty if model requests a tool
            const response = await llm.streamChat(
                'List the files in the current directory. Use the list tool.'
            );

            // Response is defined (may be empty if tool was requested)
            expect(response).toBeDefined();
        }, 60000);
    });

    describe('Context Stress', () => {
        it('should handle medium context (10k tokens)', async () => {
            if (!apiKeyAvailable) return;

            // Generate ~10k tokens of context (~2k words)
            const padding = 'This is a test sentence for context stress testing. '.repeat(200);

            const start = Date.now();
            const response = await llm.streamChat(
                `${padding}\n\nBased on the above context, respond with just "understood".`
            );
            const latency = Date.now() - start;

            console.log(`[10k context] Latency: ${latency}ms`);

            expect(response).toBeDefined();
            expect(latency).toBeLessThan(30000);
        }, 60000);

        it('should handle large context (50k tokens)', async () => {
            if (!apiKeyAvailable) return;

            // Generate ~50k tokens of context
            const padding = 'This is a comprehensive test paragraph for evaluating how the model handles extended context windows. '.repeat(500);

            const start = Date.now();
            const response = await llm.streamChat(
                `${padding}\n\nConfirm you received this large context by saying "received".`
            );
            const latency = Date.now() - start;

            console.log(`[50k context] Latency: ${latency}ms`);

            expect(response).toBeDefined();
            expect(latency).toBeLessThan(120000);
        }, 180000);

        it('should handle 100k token context (tier 2 mid-range)', async () => {
            if (!apiKeyAvailable) return;

            // Generate ~100k tokens of context
            // ~25 tokens per repetition, 4000 reps = 100k tokens
            const padding = 'This is an extensive test passage designed to stress the context window capabilities of the language model. '.repeat(4000);

            console.log(`[100k context] Sending ~${Math.round(padding.length / 4)} estimated tokens...`);
            const start = Date.now();
            const response = await llm.streamChat(
                `${padding}\n\nYou have received approximately 100,000 tokens of context. Confirm by saying "100k acknowledged".`
            );
            const latency = Date.now() - start;

            console.log(`[100k context] Latency: ${latency}ms`);

            expect(response).toBeDefined();
            expect(latency).toBeLessThan(180000); // 3 minutes
        }, 300000);

        it('should handle 200k token context (tier 2 maximum)', async () => {
            if (!apiKeyAvailable) return;

            // Generate ~200k tokens of context (tier 2 max)
            // ~25 tokens per repetition, 8000 reps = 200k tokens
            const padding = 'This is an extensive test passage designed to stress the context window capabilities of the language model. '.repeat(8000);

            console.log(`[200k context] Sending ~${Math.round(padding.length / 4)} estimated tokens (TIER 2 MAX)...`);
            console.log(`[200k context] WARNING: This test will cost approximately $0.60-1.00 in API fees`);
            const start = Date.now();
            const response = await llm.streamChat(
                `${padding}\n\nYou have received approximately 200,000 tokens of context, which is the maximum for tier 2. Confirm by saying "200k tier 2 max acknowledged".`
            );
            const latency = Date.now() - start;

            console.log(`[200k context] Latency: ${latency}ms`);
            console.log(`[200k context] Latency per 10k tokens: ${(latency / 20).toFixed(0)}ms`);

            expect(response).toBeDefined();
            expect(latency).toBeLessThan(300000); // 5 minutes
        }, 600000);
    });

    describe('Memory Integration', () => {
        it('should inject memory context into prompts', async () => {
            if (!apiKeyAvailable) return;

            const { memory } = await import('../../src/core/memory.js');

            // Store a test fact
            await memory.init();
            await memory.store('user_preference', 'stress_test_name', 'StressTestUser');

            // Get context
            const memoryContext = await memory.getUserContext();

            // Send to LLM with memory context
            const response = await llm.streamChat(
                `${memoryContext}\n\nWhat is my name according to the recall above?`
            );

            expect(response).toBeDefined();
            // The LLM should mention the stored name
            expect(response.toLowerCase()).toContain('stresstestuser');

            // Cleanup
            await memory.forget('stress_test_name');
        }, 60000);
    });

    describe('Rapid Fire', () => {
        it('should handle 5 sequential requests', async () => {
            if (!apiKeyAvailable) return;

            const results: { index: number; latency: number; success: boolean }[] = [];

            for (let i = 0; i < 5; i++) {
                const start = Date.now();
                try {
                    const response = await llm.streamChat(`Request ${i + 1}: Say "ack ${i + 1}"`);
                    results.push({
                        index: i + 1,
                        latency: Date.now() - start,
                        success: response.includes(`${i + 1}`),
                    });
                } catch (error) {
                    results.push({
                        index: i + 1,
                        latency: Date.now() - start,
                        success: false,
                    });
                }
            }

            console.log('[RAPID FIRE] Results:', results);

            const successRate = results.filter(r => r.success).length / results.length;
            const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;

            console.log(`[RAPID FIRE] Success rate: ${(successRate * 100).toFixed(1)}%`);
            console.log(`[RAPID FIRE] Avg latency: ${avgLatency.toFixed(0)}ms`);

            expect(successRate).toBeGreaterThanOrEqual(0.8); // At least 80% success
        }, 300000);
    });

    describe('Error Recovery', () => {
        it('should handle malformed input gracefully', async () => {
            if (!apiKeyAvailable) return;

            // Test with empty input
            const response1 = await llm.streamChat('');
            expect(response1).toBeDefined();

            // Test with very long single word (potential token issues)
            const longWord = 'a'.repeat(10000);
            const response2 = await llm.streamChat(`Is this word valid: ${longWord}?`);
            expect(response2).toBeDefined();
        }, 60000);
    });
});

describe('Performance Metrics', () => {
    it('should measure and report token usage', async () => {
        const { keyManager } = await import('../../src/core/keyManager.js');
        const key = await keyManager.loadKey();
        if (!key) return;

        const { db } = await import('../../src/core/database.js');

        // Get usage stats from database
        const stats = db.getDb().prepare(`
            SELECT 
                SUM(input_tokens) as total_input,
                SUM(output_tokens) as total_output,
                SUM(cost) as total_cost,
                COUNT(*) as request_count
            FROM usage_stats
            WHERE timestamp > ?
        `).get(Math.floor(Date.now() / 1000) - 3600) as any;

        console.log('\n[USAGE METRICS] Last hour:');
        console.log(`  Requests: ${stats?.request_count || 0}`);
        console.log(`  Input tokens: ${stats?.total_input || 0}`);
        console.log(`  Output tokens: ${stats?.total_output || 0}`);
        console.log(`  Total cost: $${(stats?.total_cost || 0).toFixed(4)}`);

        expect(true).toBe(true); // This is a reporting test
    });
});
