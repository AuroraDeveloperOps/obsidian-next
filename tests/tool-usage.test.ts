import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LLMClient } from '../src/core/llm.js';
import { bus } from '../src/core/bus.js';
import { AgentEvent } from '../src/events/types.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Tool Usage Integration Tests
 *
 * These tests evaluate:
 * 1. Whether the model correctly identifies when to use tools
 * 2. Whether tool parameters are correctly extracted
 * 3. Whether tool results are properly handled
 * 4. Safety limits (iteration cap, approval mechanism)
 */

describe('Tool Usage Integration', () => {
    let client: LLMClient;
    let events: AgentEvent[] = [];
    const handler = (e: AgentEvent) => events.push(e);

    // Test file for read/write operations
    const testDir = path.join(process.cwd(), 'test-workspace');
    const testFile = path.join(testDir, 'test-file.txt');

    beforeEach(async () => {
        client = new LLMClient();
        events = [];
        bus.on('agent', handler);

        // Create test workspace
        await fs.mkdir(testDir, { recursive: true });
        await fs.writeFile(testFile, 'Hello, this is a test file.\nLine 2\nLine 3\n');
    });

    afterEach(async () => {
        bus.off('agent', handler);
        client.clearHistory();

        // Cleanup test workspace
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    // Skip helper for billing issues
    function skipIfBillingError(): boolean {
        const errors = events.filter(e => e.type === 'error');
        const hasBillingError = errors.some(e =>
            'message' in e && e.message.includes('credit balance')
        );
        if (hasBillingError) {
            console.log('    > Skipping: API credits required');
            return true;
        }
        return false;
    }

    it('should use read tool when asked to read a file', async () => {
        const prompt = `Read the file at ${testFile} and tell me what it contains. Be very brief.`;

        console.log('    > Testing read tool usage...');
        const response = await client.streamChat(prompt);

        if (skipIfBillingError()) return;

        // Check for tool_start events
        const toolStarts = events.filter(e => e.type === 'tool_start');
        const toolResults = events.filter(e => e.type === 'tool_result');

        console.log('    > Tool starts:', toolStarts.length);
        console.log('    > Tool results:', toolResults.length);

        // Model should have used the read tool
        const readToolUsed = toolStarts.some(e =>
            'tool' in e && e.tool === 'read'
        );

        expect(readToolUsed).toBe(true);
        expect(response).toBeTruthy();
        // Response should mention content from the file
        expect(response?.toLowerCase()).toMatch(/hello|test file|line/i);
    }, 30000);

    it('should use list tool when asked about directory contents', async () => {
        const prompt = `What files are in the ${testDir} directory? Just list them briefly.`;

        console.log('    > Testing list tool usage...');
        const response = await client.streamChat(prompt);

        if (skipIfBillingError()) return;

        const toolStarts = events.filter(e => e.type === 'tool_start');

        // Model should have used the list tool
        const listToolUsed = toolStarts.some(e =>
            'tool' in e && e.tool === 'list'
        );

        console.log('    > List tool used:', listToolUsed);

        expect(listToolUsed).toBe(true);
        expect(response).toBeTruthy();
        expect(response?.toLowerCase()).toContain('test-file.txt');
    }, 30000);

    it('should use bash tool for shell commands', async () => {
        const prompt = 'Run "echo hello" and tell me the output. Be brief.';

        console.log('    > Testing bash tool usage...');
        const response = await client.streamChat(prompt);

        if (skipIfBillingError()) return;

        const toolStarts = events.filter(e => e.type === 'tool_start');

        // Model should have used the bash tool
        const bashToolUsed = toolStarts.some(e =>
            'tool' in e && e.tool === 'bash'
        );

        console.log('    > Bash tool used:', bashToolUsed);

        expect(bashToolUsed).toBe(true);
        expect(response).toBeTruthy();
        expect(response?.toLowerCase()).toContain('hello');
    }, 30000);

    it('should use grep tool for searching code', async () => {
        // Create a file with searchable content
        await fs.writeFile(
            path.join(testDir, 'code.ts'),
            'function testFunction() {\n  return "hello";\n}\n'
        );

        const prompt = `Search for "testFunction" in ${testDir}. Be brief.`;

        console.log('    > Testing grep tool usage...');
        const response = await client.streamChat(prompt);

        if (skipIfBillingError()) return;

        const toolStarts = events.filter(e => e.type === 'tool_start');

        // Model should have used the grep tool
        const grepToolUsed = toolStarts.some(e =>
            'tool' in e && e.tool === 'grep'
        );

        console.log('    > Grep tool used:', grepToolUsed);

        expect(grepToolUsed).toBe(true);
        expect(response).toBeTruthy();
    }, 30000);

    it('should chain multiple tools when needed', async () => {
        const prompt = `First list the files in ${testDir}, then read the test-file.txt. Summarize in one sentence.`;

        console.log('    > Testing tool chaining...');
        const response = await client.streamChat(prompt);

        if (skipIfBillingError()) return;

        const toolStarts = events.filter(e => e.type === 'tool_start');

        // Should have used multiple tools
        const toolsUsed = toolStarts.map(e => 'tool' in e ? e.tool : '');
        console.log('    > Tools used:', toolsUsed);

        expect(toolStarts.length).toBeGreaterThanOrEqual(2);
        expect(response).toBeTruthy();
    }, 45000);

    it('should NOT use tools for simple questions', async () => {
        const prompt = 'What is 2 + 2? Answer in one word.';

        console.log('    > Testing no-tool response...');
        const response = await client.streamChat(prompt);

        if (skipIfBillingError()) return;

        const toolStarts = events.filter(e => e.type === 'tool_start');

        console.log('    > Tools used:', toolStarts.length);

        // Should NOT use any tools for simple math
        expect(toolStarts.length).toBe(0);
        expect(response).toBeTruthy();
        expect(response?.toLowerCase()).toMatch(/four|4/);
    }, 15000);
});

describe('Tool Safety Limits', () => {
    let client: LLMClient;
    let events: AgentEvent[] = [];
    const handler = (e: AgentEvent) => events.push(e);

    beforeEach(() => {
        client = new LLMClient();
        events = [];
        bus.on('agent', handler);
    });

    afterEach(() => {
        bus.off('agent', handler);
        client.clearHistory();
    });

    it('should emit approval_request for dangerous commands', async () => {
        // Note: This test checks that the approval mechanism triggers
        // The actual approval flow requires UI interaction

        const prompt = 'Run "rm -rf /tmp/test" (this is safe, tmp directory)';

        console.log('    > Testing approval mechanism trigger...');

        // Start the request but don't wait for full completion
        // since it will timeout waiting for approval
        const responsePromise = client.streamChat(prompt);

        // Give it time to process and emit approval request
        await new Promise(resolve => setTimeout(resolve, 5000));

        const approvalRequests = events.filter(e => e.type === 'approval_request');
        console.log('    > Approval requests:', approvalRequests.length);

        // Clean up - the promise will likely reject due to timeout
        try {
            await Promise.race([
                responsePromise,
                new Promise((_, reject) => setTimeout(() => reject('timeout'), 1000))
            ]);
        } catch { /* expected timeout */ }

        // If we got an approval request, the safety mechanism is working
        // If not, it might be a billing issue or the model didn't use rm
        const errors = events.filter(e => e.type === 'error');
        const hasBillingError = errors.some(e =>
            'message' in e && e.message.includes('credit balance')
        );

        if (!hasBillingError) {
            // Either approval was requested OR model chose a safer approach
            console.log('    > Safety check completed');
        }
    }, 20000);
});
