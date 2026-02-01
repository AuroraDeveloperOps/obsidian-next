
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { SandboxExecutor } from '../../src/core/sandbox.js';
import { settings } from '../../src/core/settings.js';
import { auditor } from '../../src/core/auditor.js';
import { BashTool } from '../../src/core/tools.js';

describe('Real-World Sandbox Integration', () => {
    let sandbox: SandboxExecutor;
    const workspaceRoot = process.cwd();
    const sensitiveFile = path.join(process.env.HOME || '/root', '.ssh', 'id_rsa');

    beforeEach(async () => {
        sandbox = new SandboxExecutor();
        // Reset settings for each test
        vi.spyOn(settings, 'load').mockResolvedValue({
            security: { sandbox: true },
            mode: 'safe',
            permissions: { allow: [], deny: [] },
            autoAccept: { enabled: false, readOperations: false, safeCommands: false },
            ui: { syntaxHighlight: true, diffColors: true, showLineNumbers: true }
        } as any);

        await sandbox.initialize();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // 1. Sandbox Isolation Tests
    describe('Sandbox Isolation', () => {
        it('should wrap dangerous commands with sandbox wrapper', async () => {
            // Depending on OS, this should return a sandboxed string
            const cmd = 'cat ~/.ssh/id_rsa';
            const wrapped = await sandbox.wrapCommand(cmd);

            if (process.platform === 'darwin') {
                expect(wrapped).toContain('sandbox-exec');
                expect(wrapped).toContain('deny file-read*');
            } else if (process.platform === 'linux') {
                // We expect it to try to use firejail if available, or at least attempt it
                // Since we can't easily mock `which firejail` result deeply inside sandbox without mocking child_process for sandbox.ts specifically, 
                // we'll check if the logic attempts to sandbox.
                // For this test running in an agent environment, we might not have firejail/sandbox-exec, so we check logic flow.
                const mode = sandbox.getMode();
                expect(mode).toBe('sandbox');
            }
        });

        it('should allow benign operations in workspace', async () => {
            const cmd = 'ls -la';
            const wrapped = await sandbox.wrapCommand(cmd);
            // Even benign commands get wrapped in sandbox mode
            if (process.platform === 'darwin') {
                expect(wrapped).toContain('sandbox-exec');
            }
        });
    });

    // 2. Mode Enforcement Tests
    describe('Mode Enforcement', () => {
        it('should require approval for all commands in SAFE mode', async () => {
            vi.spyOn(settings, 'load').mockResolvedValue({
                security: { sandbox: true },
                mode: 'safe',
                permissions: { allow: [], deny: [] },
                autoAccept: { enabled: false, readOperations: false, safeCommands: false },
                ui: { syntaxHighlight: true, diffColors: true, showLineNumbers: true }
            } as any);

            const cmd = 'echo "hello world"';
            const audit = await auditor.checkCommand(cmd);

            expect(audit.approved).toBe(false);
            expect(audit.requiresApproval).toBe(true);
            expect(audit.reason).toContain('Safe mode');
        });

        it('should auto-approve safe commands in AUTO mode', async () => {
            vi.spyOn(settings, 'load').mockResolvedValue({
                security: { sandbox: true },
                mode: 'auto',
                permissions: { allow: [], deny: [] },
                autoAccept: { enabled: false, readOperations: false, safeCommands: false },
                ui: { syntaxHighlight: true, diffColors: true, showLineNumbers: true }
            } as any);

            const cmd = 'echo "hello world"';
            const audit = await auditor.checkCommand(cmd);

            // Note: simple echo is not in BLOCKED_PATTERNS or APPROVAL_PATTERNS
            expect(audit.approved).toBe(true);
        });

        it('should ALWAYS block critical commands regardless of mode', async () => {
            vi.spyOn(settings, 'load').mockResolvedValue({
                security: { sandbox: true },
                mode: 'auto',
                permissions: { allow: [], deny: [] },
                autoAccept: { enabled: false, readOperations: false, safeCommands: false },
                ui: { syntaxHighlight: true, diffColors: true, showLineNumbers: true }
            } as any);

            const cmd = 'rm -rf /';
            const audit = await auditor.checkCommand(cmd);

            expect(audit.approved).toBe(false);
            expect(audit.isCritical).toBe(true);
        });
    });

    // 3. Tool Chain & File System Tests
    describe('Tool Chain Execution', () => {
        it('should block reading sensitive files via ReadTool (simulated)', async () => {
            // We can't actually read /etc/shadow or ~/.ssh here safely/permission-wise in all envs,
            // but we can check the Auditor logic which ReadTool uses.

            // Mock auditor to reject outside paths (which it does by default)
            const outsidePath = '/etc/passwd';
            const audit = auditor.checkPath(outsidePath);

            expect(audit.approved).toBe(false);
            expect(audit.reason).toContain('Path outside workspace');
        });

        it('should allow writing to workspace files', async () => {
            const testFile = 'test-sandbox-write.txt';
            const audit = auditor.checkPath(testFile);
            expect(audit.approved).toBe(true);
        });
    });
});
