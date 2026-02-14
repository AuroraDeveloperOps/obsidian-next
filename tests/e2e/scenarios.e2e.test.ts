/**
 * Real-World Scenario E2E Tests
 *
 * Tests that simulate actual user workflows:
 * - Code exploration and understanding
 * - File creation and modification
 * - Multi-step tasks
 * - Error recovery
 *
 * NOTE: These tests operate within the actual project workspace to avoid
 * path validation issues with the security auditor.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { setupTestWorkspace, createProjectStructure, createTestFile } from '../setup-helpers.js';

// Direct imports from tool files
import { ReadTool } from '../../src/tools/filesystem/read.js';
import { WriteTool } from '../../src/tools/filesystem/write.js';
import { EditTool } from '../../src/tools/filesystem/edit.js';
import { ListTool } from '../../src/tools/filesystem/list.js';
import { GrepTool } from '../../src/tools/filesystem/grep.js';
import { GlobTool } from '../../src/tools/filesystem/glob.js';

let testWorkspace: string;
let cleanup: () => Promise<void>;

describe('Real-World Scenarios', () => {
    beforeEach(async () => {
        const setup = await setupTestWorkspace('scenarios');
        testWorkspace = setup.workspace;
        cleanup = setup.cleanup;

        // Create realistic project structure
        await createProjectStructure(testWorkspace);

        // Add multiply function to index.ts
        await createTestFile(
            testWorkspace,
            'src/index.ts',
            `export function main() {
    console.log('Hello, World!');
}

export function add(a: number, b: number): number {
    return a + b;
}

export function multiply(a: number, b: number): number {
    return a * b;
}`
        );

        // Add TODO to utils
        await createTestFile(
            testWorkspace,
            'src/utils.ts',
            `export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function formatDate(date: Date): string {
    return date.toISOString();
}

// TODO: Add more utilities`
        );
    });

    afterEach(async () => {
        await cleanup();
    });

    describe('Scenario: Code Exploration', () => {
        it('should list project structure', async () => {
            const result = await ListTool.execute({ path: testWorkspace });

            expect(result.success).toBe(true);
            expect(result.output).toContain('src');
            expect(result.output).toContain('tests');
            expect(result.output).toContain('package.json');
        });

        it('should read and understand source files', async () => {
            const result = await ReadTool.execute({
                path: path.join(testWorkspace, 'src/index.ts'),
            });

            expect(result.success).toBe(true);
            expect(result.output).toContain('function main');
            expect(result.output).toContain('function add');
            expect(result.output).toContain('function multiply');
        });

        it('should search for patterns across files', async () => {
            const result = await GrepTool.execute({
                pattern: 'function',
                path: testWorkspace,
            });

            expect(result.success).toBe(true);
            expect(result.output).toContain('function');
        });

        it('should find TypeScript files with glob', async () => {
            const result = await GlobTool.execute({
                pattern: '**/*.ts',
                path: testWorkspace,
            });

            expect(result.success).toBe(true);
            expect(result.output).toContain('.ts');
        });
    });

    describe('Scenario: Add New Feature', () => {
        it('should create a new file for a feature', async () => {
            const newFile = path.join(testWorkspace, 'src/calculator.ts');

            const result = await WriteTool.execute({
                path: newFile,
                content: `/**
 * Calculator module
 */
export function divide(a: number, b: number): number {
    if (b === 0) {
        throw new Error('Division by zero');
    }
    return a / b;
}

export function subtract(a: number, b: number): number {
    return a - b;
}
`,
            });

            expect(result.success).toBe(true);

            // Verify file exists and has correct content
            const content = await fs.readFile(newFile, 'utf-8');
            expect(content).toContain('function divide');
            expect(content).toContain('Division by zero');
        });

        it('should modify existing code to add functionality', async () => {
            const result = await EditTool.execute({
                path: path.join(testWorkspace, 'src/index.ts'),
                search: `export function multiply(a: number, b: number): number {
    return a * b;
}`,
                replace: `export function multiply(a: number, b: number): number {
    return a * b;
}

export function power(base: number, exponent: number): number {
    return Math.pow(base, exponent);
}`,
            });

            expect(result.success).toBe(true);

            // Verify the change
            const content = await fs.readFile(
                path.join(testWorkspace, 'src/index.ts'),
                'utf-8'
            );
            expect(content).toContain('function power');
            expect(content).toContain('Math.pow');
        });
    });

    describe('Scenario: Fix a Bug', () => {
        it('should locate bug by searching for keywords', async () => {
            const result = await GrepTool.execute({
                pattern: 'TODO',
                path: testWorkspace,
            });

            expect(result.success).toBe(true);
            expect(result.output).toContain('utils.ts');
        });

        it('should fix identified issue with edit', async () => {
            const result = await EditTool.execute({
                path: path.join(testWorkspace, 'src/utils.ts'),
                search: '// TODO: Add more utilities',
                replace: `export function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + '...';
}`,
            });

            expect(result.success).toBe(true);

            // Verify fix was applied
            const content = await fs.readFile(
                path.join(testWorkspace, 'src/utils.ts'),
                'utf-8'
            );
            expect(content).toContain('function truncate');
            expect(content).not.toContain('TODO');
        });
    });

    describe('Scenario: Create Test File', () => {
        it('should create test file for existing module', async () => {
            const testFile = path.join(testWorkspace, 'tests/index.test.ts');

            const result = await WriteTool.execute({
                path: testFile,
                content: `import { describe, it, expect } from 'vitest';
import { add, multiply } from '../src/index';

describe('Math functions', () => {
    describe('add', () => {
        it('should add two positive numbers', () => {
            expect(add(2, 3)).toBe(5);
        });

        it('should handle negative numbers', () => {
            expect(add(-1, 1)).toBe(0);
        });

        it('should handle zero', () => {
            expect(add(0, 5)).toBe(5);
        });
    });

    describe('multiply', () => {
        it('should multiply two numbers', () => {
            expect(multiply(2, 3)).toBe(6);
        });

        it('should return zero when multiplied by zero', () => {
            expect(multiply(5, 0)).toBe(0);
        });
    });
});
`,
            });

            expect(result.success).toBe(true);

            // Verify test file was created correctly
            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toContain('describe');
            expect(content).toContain('expect');
            expect(content).toContain('add(2, 3)');
        });
    });

    describe('Scenario: Multi-Step Refactoring', () => {
        it('should perform sequential file operations', async () => {
            // Step 1: Read the current state
            const readResult = await ReadTool.execute({
                path: path.join(testWorkspace, 'src/utils.ts'),
            });
            expect(readResult.success).toBe(true);

            // Step 2: Create a new module to extract code to
            const writeResult = await WriteTool.execute({
                path: path.join(testWorkspace, 'src/string-utils.ts'),
                content: `/**
 * String utility functions (extracted from utils.ts)
 */
export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function toLowerCase(str: string): string {
    return str.toLowerCase();
}

export function toUpperCase(str: string): string {
    return str.toUpperCase();
}
`,
            });
            expect(writeResult.success).toBe(true);

            // Step 3: Update original file to re-export
            const editResult = await EditTool.execute({
                path: path.join(testWorkspace, 'src/utils.ts'),
                search: `export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}`,
                replace: `// String utilities moved to string-utils.ts
export { capitalize } from './string-utils';`,
            });
            expect(editResult.success).toBe(true);

            // Verify final state
            const utilsContent = await fs.readFile(
                path.join(testWorkspace, 'src/utils.ts'),
                'utf-8'
            );
            expect(utilsContent).toContain("from './string-utils'");

            const stringUtilsContent = await fs.readFile(
                path.join(testWorkspace, 'src/string-utils.ts'),
                'utf-8'
            );
            expect(stringUtilsContent).toContain('function capitalize');
        });
    });

    describe('Scenario: Error Recovery', () => {
        it('should handle file not found gracefully', async () => {
            const result = await ReadTool.execute({
                path: path.join(testWorkspace, 'nonexistent-file.ts'),
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should handle invalid edit target gracefully', async () => {
            const result = await EditTool.execute({
                path: path.join(testWorkspace, 'src/index.ts'),
                search: 'this string does not exist in the file',
                replace: 'replacement',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should not corrupt files on failed operations', async () => {
            // Read original content
            const originalResult = await ReadTool.execute({
                path: path.join(testWorkspace, 'src/index.ts'),
            });
            const originalContent = originalResult.output;

            // Attempt failed edit
            await EditTool.execute({
                path: path.join(testWorkspace, 'src/index.ts'),
                search: 'nonexistent pattern',
                replace: 'replacement',
            });

            // Verify file unchanged
            const afterResult = await ReadTool.execute({
                path: path.join(testWorkspace, 'src/index.ts'),
            });

            expect(afterResult.output).toBe(originalContent);
        });
    });
});

describe('Tool Output Quality', () => {
    let testWorkspace: string;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
        const setup = await setupTestWorkspace('tool-output');
        testWorkspace = setup.workspace;
        cleanup = setup.cleanup;
    });

    afterEach(async () => {
        await cleanup();
    });

    it('should provide clear success messages', async () => {
        const result = await WriteTool.execute({
            path: path.join(testWorkspace, 'test.txt'),
            content: 'test content',
        });

        expect(result.success).toBe(true);
        expect(result.output).toContain('Created file');
        expect(result.output).toContain('test.txt');
        expect(result.output).toContain('bytes');
    });

    it('should provide clear error messages', async () => {
        const result = await ReadTool.execute({
            path: path.join(testWorkspace, 'missing.txt'),
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.length).toBeGreaterThan(10);
    });

    it('should include line numbers in read output', async () => {
        await fs.writeFile(
            path.join(testWorkspace, 'numbered.txt'),
            'Line one\nLine two\nLine three'
        );

        const result = await ReadTool.execute({
            path: path.join(testWorkspace, 'numbered.txt'),
        });

        expect(result.success).toBe(true);
        expect(result.output).toMatch(/\d+\s*\|/);
    });

    it('should show diff preview for edits', async () => {
        await fs.writeFile(
            path.join(testWorkspace, 'diff-test.txt'),
            'old content here'
        );

        const result = await EditTool.execute({
            path: path.join(testWorkspace, 'diff-test.txt'),
            search: 'old content',
            replace: 'new content',
        });

        expect(result.success).toBe(true);
        expect(result.output).toContain('-');
        expect(result.output).toContain('+');
    });
});
