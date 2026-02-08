/**
 * Manual tool verification - tests each tool directly without LLM API calls
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tools } from '../src/core/tools.js';
import fs from 'fs/promises';
import path from 'path';

// Use workspace-relative path (allowed by sandbox)
const TEST_DIR = path.join(process.cwd(), '.test-temp');

describe('Tools Direct Execution', () => {
    beforeAll(async () => {
        // Ensure test directory exists within workspace
        await fs.mkdir(TEST_DIR, { recursive: true });
    });

    afterAll(async () => {
        // Cleanup test directory
        await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => { });
    });

    describe('list tool', () => {
        it('should list current directory', async () => {
            const result = await tools.execute('list', { path: process.cwd() });
            expect(result.success).toBe(true);
            expect(result.output).toContain('package.json');
        });

        it('should list with details', async () => {
            const result = await tools.execute('list', { path: process.cwd(), details: true });
            expect(result.success).toBe(true);
            expect(result.output).toContain('src');
        });
    });

    describe('read tool', () => {
        it('should read package.json', async () => {
            const result = await tools.execute('read', { path: path.join(process.cwd(), 'package.json') });
            expect(result.success).toBe(true);
            expect(result.output).toContain('obsidian-next');
        });

        it('should read with line range', async () => {
            const result = await tools.execute('read', { path: path.join(process.cwd(), 'package.json'), start: 1, end: 5 });
            expect(result.success).toBe(true);
        });

        it('should fail for non-existent file', async () => {
            const result = await tools.execute('read', { path: 'nonexistent-file-xyz.txt' });
            expect(result.success).toBe(false);
        });
    });

    describe('write tool', () => {
        it('should write a new file in workspace', async () => {
            const testFile = path.join(TEST_DIR, 'write-test.txt');
            const result = await tools.execute('write', {
                path: testFile,
                content: 'Hello from write tool test'
            });

            // Should succeed since path is within workspace
            expect(result.success).toBe(true);

            // Verify content
            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toBe('Hello from write tool test');

            // Cleanup
            await fs.unlink(testFile).catch(() => { });
        });

        it('should reject writes outside workspace', async () => {
            const result = await tools.execute('write', {
                path: '/tmp/outside-workspace.txt',
                content: 'Should fail'
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('outside');
        });
    });

    describe('edit tool', () => {
        it('should edit an existing file in workspace', async () => {
            const testFile = path.join(TEST_DIR, 'edit-test.txt');
            await fs.writeFile(testFile, 'Hello World');

            const result = await tools.execute('edit', {
                path: testFile,
                search: 'World',
                replace: 'Obsidian'
            });

            expect(result.success).toBe(true);
            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toBe('Hello Obsidian');

            // Cleanup
            await fs.unlink(testFile).catch(() => { });
        });

        it('should fail if search string not found', async () => {
            const testFile = path.join(TEST_DIR, 'edit-test-2.txt');
            await fs.writeFile(testFile, 'Hello World');

            const result = await tools.execute('edit', {
                path: testFile,
                search: 'NotFound',
                replace: 'Something'
            });
            expect(result.success).toBe(false);

            // Cleanup
            await fs.unlink(testFile).catch(() => { });
        });

        it('should reject edits outside workspace', async () => {
            const result = await tools.execute('edit', {
                path: '/tmp/outside-workspace.txt',
                search: 'foo',
                replace: 'bar'
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('outside');
        });
    });

    describe('glob tool', () => {
        it('should find TypeScript files', async () => {
            const result = await tools.execute('glob', { pattern: 'src/**/*.ts' });
            expect(result.success).toBe(true);
            expect(result.output).toContain('src/');
        });

        it('should find test files', async () => {
            const result = await tools.execute('glob', { pattern: 'tests/**/*.test.ts' });
            expect(result.success).toBe(true);
            expect(result.output).toContain('.test.ts');
        });
    });

    describe('grep tool', () => {
        it('should find pattern in files', async () => {
            const result = await tools.execute('grep', {
                pattern: 'export class',
                path: 'src/core'
            });
            expect(result.success).toBe(true);
        });

        it('should support case insensitive search', async () => {
            const result = await tools.execute('grep', {
                pattern: 'OBSIDIAN',
                path: 'package.json',
                flags: '-i'
            });
            expect(result.success).toBe(true);
        });
    });

    describe('bash tool', () => {
        it('should execute simple command', async () => {
            const result = await tools.execute('bash', { command: 'echo "hello"' });
            expect(result.success).toBe(true);
            expect(result.output).toContain('hello');
        });

        it('should execute pwd', async () => {
            const result = await tools.execute('bash', { command: 'pwd' });
            expect(result.success).toBe(true);
            // Don't assert on exact path since working directory may vary during tests
            expect(result.output.length).toBeGreaterThan(0);
        });

        it('should handle command failure', async () => {
            const result = await tools.execute('bash', { command: 'exit 1' });
            expect(result.success).toBe(false);
        });
    });

    describe('web_fetch tool', () => {
        it('should fetch a URL', async () => {
            const result = await tools.execute('web_fetch', {
                url: 'https://httpbin.org/get'
            });
            expect(result.success).toBe(true);
            expect(result.output).toContain('httpbin');
        }, 10000);

        it('should handle invalid URL', async () => {
            const result = await tools.execute('web_fetch', {
                url: 'https://this-domain-does-not-exist-xyz.com'
            });
            expect(result.success).toBe(false);
        }, 10000);
    });

    describe('tools.list()', () => {
        it('should return available tools', async () => {
            const availableTools = await tools.list();
            expect(availableTools.length).toBeGreaterThan(0);

            const toolNames = availableTools.map(t => t.name);
            expect(toolNames).toContain('bash');
            expect(toolNames).toContain('read');
            expect(toolNames).toContain('write');
            expect(toolNames).toContain('edit');
            expect(toolNames).toContain('list');
            expect(toolNames).toContain('grep');
            expect(toolNames).toContain('glob');
            expect(toolNames).toContain('web_fetch');
        });

        it('should have descriptions for all tools', async () => {
            const availableTools = await tools.list();
            for (const tool of availableTools) {
                expect(tool.description).toBeDefined();
                expect(tool.description.length).toBeGreaterThan(0);
            }
        });

        it('should have input schemas for all tools', async () => {
            const availableTools = await tools.list();
            for (const tool of availableTools) {
                expect(tool.inputSchema).toBeDefined();
            }
        });
    });
});
