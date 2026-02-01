
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient } from '../src/core/llm';
import { bus } from '../src/core/bus';

// Mock dependencies
vi.mock('../src/core/bus', () => ({
    bus: {
        emitAgent: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
    }
}));

vi.mock('../src/core/config', () => ({
    config: {
        load: vi.fn().mockResolvedValue({
            model: 'test-model',
            summarizerModel: 'test-summarizer',
        }),
        hasDeprecatedKey: vi.fn().mockReturnValue(false),
    }
}));

vi.mock('../src/core/usage', () => ({
    usage: {
        init: vi.fn(),
        getContextUsage: vi.fn().mockResolvedValue({ used: 0, limit: 10000 }),
        track: vi.fn(),
    }
}));

vi.mock('../src/core/keyManager', () => ({
    keyManager: {
        loadKey: vi.fn().mockResolvedValue('test-key'),
        getBackend: vi.fn().mockReturnValue('env'),
    },
    detectEnvFile: vi.fn().mockResolvedValue({ found: false }),
}));

// Access private methods for testing
const getPrivateMethod = (obj: any, method: string) => obj[method].bind(obj);

describe('LLMClient Context Management', () => {
    let llm: LLMClient;

    beforeEach(() => {
        vi.clearAllMocks();
        llm = new LLMClient();
        // Manually set client to allow testing without full init
        (llm as any).client = {
            messages: {
                create: vi.fn().mockResolvedValue({
                    content: [{ type: 'text', text: 'Summary of the middle part.' }]
                })
            }
        };
        (llm as any).lastConfig = { summarizerModel: 'test-summarizer' };
    });

    it('should compress history when it exceeds the limit', async () => {
        const compressHistory = getPrivateMethod(llm, 'compressHistory');

        // Create a long history (50 messages)
        const history = [];
        for (let i = 0; i < 50; i++) {
            history.push({ role: 'user', content: `Message ${i}` });
        }
        (llm as any).conversationHistory = history;

        await compressHistory();

        const newHistory = (llm as any).conversationHistory;

        // Expect reduction
        expect(newHistory.length).toBeLessThan(50);

        // Head check
        expect(newHistory[0].content).toBe('Message 0');
        expect(newHistory[1].content).toBe('Message 1');

        // Tail check (last 15 preserved)
        // Message 49 is last. Message 35 should be start of tail.
        const lastMsg = newHistory[newHistory.length - 1];
        expect(lastMsg.content).toBe('Message 49');

        // Middle should be summary
        const summaryMsg = newHistory[2];
        expect(summaryMsg.role).toBe('user');
        expect(summaryMsg.content).toContain('Summary of the middle part');
        expect(summaryMsg.content).toContain('System: Context compressed');
        expect(summaryMsg.content).toContain('<conversation_summary>');
    });

    it('should fallback to pruning if summarization fails', async () => {
        const compressHistory = getPrivateMethod(llm, 'compressHistory');

        // Mock client failure
        (llm as any).client.messages.create.mockRejectedValue(new Error('API Error'));

        // Create a long history (50 messages)
        const history = [];
        for (let i = 0; i < 50; i++) {
            history.push({ role: 'user', content: `Message ${i}` });
        }
        (llm as any).conversationHistory = history;

        await compressHistory();

        const newHistory = (llm as any).conversationHistory;

        // Should still be reduced via fallback
        expect(newHistory.length).toBeLessThan(50);

        // Check for fallback message
        const prunedMsg = newHistory[2];
        expect(prunedMsg.content).toContain('History Pruned');
        expect(prunedMsg.content).not.toContain('Summary');
    });

    it('should not compress if history is short', async () => {
        const compressHistory = getPrivateMethod(llm, 'compressHistory');

        // Short history
        const history = [];
        for (let i = 0; i < 10; i++) {
            history.push({ role: 'user', content: `Message ${i}` });
        }
        (llm as any).conversationHistory = history;

        await compressHistory();

        const newHistory = (llm as any).conversationHistory;
        expect(newHistory.length).toBe(10);
    });
});
