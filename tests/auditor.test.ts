import { describe, it, expect } from 'vitest';
import { Auditor } from '../src/core/auditor.js';
import path from 'path';

describe('Auditor', () => {
    const auditor = new Auditor(process.cwd());

    describe('checkCommand', () => {
        it('should block dangerous patterns', async () => {
            const result = await auditor.checkCommand('rm -rf /');
            expect(result.approved).toBe(false);
            expect(result.isCritical).toBe(true);
        });

        it('should block fork bombs', async () => {
            const result = await auditor.checkCommand(':(){:|:&};:');
            expect(result.approved).toBe(false);
        });

        it('should block chmod -R 777', async () => {
            const result = await auditor.checkCommand('chmod -R 777 .');
            expect(result.approved).toBe(false);
        });

        it('should allow benign commands', async () => {
            const result = await auditor.checkCommand('ls -la');
            expect(result.approved).toBe(true);
        });

        it('should allow benign commands with "rm" in the name', async () => {
            // "firm" contains "rm", but should be fine unless it matches specific patterns
            // The current implementation checks specific substrings like "rm -rf /".
            // It does NOT check just "dengerousPatterns.some(p => command.includes(p))" blindly for short strings?
            // Wait, the implementation IS: dangerousPatterns.some(p => command.includes(p))
            // Let's verify what "rm -rf /" matches.
            const result = await auditor.checkCommand('echo "confirming"');
            expect(result.approved).toBe(true);
        });
    });

    describe('checkPath', () => {
        it('should allow paths inside workspace', () => {
            const result = auditor.checkPath('src/index.ts');
            expect(result.approved).toBe(true);
        });

        it('should block paths outside workspace', () => {
            const result = auditor.checkPath('../outside.txt');
            expect(result.approved).toBe(false);
            expect(result.reason).toContain('Path outside workspace');
        });

        it('should block absolute paths outside workspace', () => {
            const result = auditor.checkPath('/etc/passwd');
            expect(result.approved).toBe(false);
        });
    });
});
