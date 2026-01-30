import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { auditLog } from '../src/core/auditLog.js';
import fs from 'fs/promises';
import path from 'path';

describe('AuditLog', () => {
    const testLogPath = path.join(process.cwd(), '.obsidian', 'audit.log');

    beforeEach(async () => {
        // Clean up any existing log file
        try {
            await fs.unlink(testLogPath);
        } catch {
            // File may not exist
        }
    });

    afterEach(async () => {
        // Clean up after tests
        try {
            await fs.unlink(testLogPath);
        } catch {
            // File may not exist
        }
    });

    describe('init', () => {
        it('should initialize without errors', async () => {
            await expect(auditLog.init()).resolves.not.toThrow();
        });
    });

    describe('logCommand', () => {
        it('should log successful command execution', async () => {
            await auditLog.init();
            await auditLog.logCommand('ls -la', true);

            // Give time for async write
            await new Promise(resolve => setTimeout(resolve, 100));

            const entries = await auditLog.getRecentEntries(10);
            const commandEntry = entries.find(e => e.eventType === 'command_executed');

            expect(commandEntry).toBeDefined();
            expect(commandEntry?.command).toBe('ls -la');
            expect(commandEntry?.success).toBe(true);
        });

        it('should log failed command execution', async () => {
            await auditLog.init();
            await auditLog.logCommand('invalid-command', false, 'Command not found');

            await new Promise(resolve => setTimeout(resolve, 100));

            const entries = await auditLog.getRecentEntries(10);
            const commandEntry = entries.find(e => e.eventType === 'command_blocked');

            expect(commandEntry).toBeDefined();
            expect(commandEntry?.success).toBe(false);
            expect(commandEntry?.reason).toBe('Command not found');
        });
    });

    describe('logFileOperation', () => {
        it('should log file read operations', async () => {
            await auditLog.init();
            await auditLog.logFileOperation('read', 'test.ts', true);

            await new Promise(resolve => setTimeout(resolve, 100));

            const entries = await auditLog.getRecentEntries(10);
            const fileEntry = entries.find(e => e.eventType === 'file_read');

            expect(fileEntry).toBeDefined();
            expect(fileEntry?.filePath).toBe('test.ts');
        });

        it('should log file write operations', async () => {
            await auditLog.init();
            await auditLog.logFileOperation('write', 'new-file.ts', true);

            await new Promise(resolve => setTimeout(resolve, 100));

            const entries = await auditLog.getRecentEntries(10);
            const fileEntry = entries.find(e => e.eventType === 'file_write');

            expect(fileEntry).toBeDefined();
        });

        it('should log file edit operations', async () => {
            await auditLog.init();
            await auditLog.logFileOperation('edit', 'existing.ts', true);

            await new Promise(resolve => setTimeout(resolve, 100));

            const entries = await auditLog.getRecentEntries(10);
            const fileEntry = entries.find(e => e.eventType === 'file_edit');

            expect(fileEntry).toBeDefined();
        });
    });

    describe('logApproval', () => {
        it('should log approval requests', async () => {
            await auditLog.init();
            await auditLog.logApproval('requested', 'rm -rf ./test', 'Potentially dangerous');

            await new Promise(resolve => setTimeout(resolve, 100));

            const entries = await auditLog.getRecentEntries(10);
            const approvalEntry = entries.find(e => e.eventType === 'approval_requested');

            expect(approvalEntry).toBeDefined();
            expect(approvalEntry?.command).toBe('rm -rf ./test');
        });

        it('should log approval grants', async () => {
            await auditLog.init();
            await auditLog.logApproval('granted', 'rm -rf ./test');

            await new Promise(resolve => setTimeout(resolve, 100));

            const entries = await auditLog.getRecentEntries(10);
            const approvalEntry = entries.find(e => e.eventType === 'approval_granted');

            expect(approvalEntry).toBeDefined();
            expect(approvalEntry?.success).toBe(true);
        });

        it('should log approval denials', async () => {
            await auditLog.init();
            await auditLog.logApproval('denied', 'rm -rf ./test');

            await new Promise(resolve => setTimeout(resolve, 100));

            const entries = await auditLog.getRecentEntries(10);
            const approvalEntry = entries.find(e => e.eventType === 'approval_denied');

            expect(approvalEntry).toBeDefined();
            expect(approvalEntry?.success).toBe(false);
        });
    });

    describe('logSecurityViolation', () => {
        it('should log security violations', async () => {
            await auditLog.init();
            await auditLog.logSecurityViolation('rm -rf /', 'Critical security violation');

            await new Promise(resolve => setTimeout(resolve, 100));

            const entries = await auditLog.getRecentEntries(10);
            const violationEntry = entries.find(e => e.eventType === 'security_violation');

            expect(violationEntry).toBeDefined();
            expect(violationEntry?.command).toBe('rm -rf /');
            expect(violationEntry?.reason).toBe('Critical security violation');
        });
    });

    describe('logRedaction', () => {
        it('should log PII redaction events', async () => {
            await auditLog.init();
            await auditLog.logRedaction(3, ['email', 'phone', 'ssn']);

            await new Promise(resolve => setTimeout(resolve, 100));

            const entries = await auditLog.getRecentEntries(10);
            const redactionEntry = entries.find(e => e.eventType === 'pii_redacted');

            expect(redactionEntry).toBeDefined();
            expect(redactionEntry?.metadata?.count).toBe(3);
            expect(redactionEntry?.metadata?.types).toContain('email');
        });
    });

    describe('search', () => {
        it('should search by event type', async () => {
            await auditLog.init();
            await auditLog.logCommand('ls', true);
            await auditLog.logCommand('pwd', true);
            await auditLog.logFileOperation('read', 'file.ts', true);

            await new Promise(resolve => setTimeout(resolve, 100));

            const results = await auditLog.search({ eventType: 'command_executed' });
            expect(results.length).toBeGreaterThanOrEqual(2);
            expect(results.every(r => r.eventType === 'command_executed')).toBe(true);
        });

        it('should search by command', async () => {
            await auditLog.init();
            await auditLog.logCommand('ls -la', true);
            await auditLog.logCommand('git status', true);

            await new Promise(resolve => setTimeout(resolve, 100));

            const results = await auditLog.search({ command: 'git' });
            expect(results.some(r => r.command?.includes('git'))).toBe(true);
        });
    });

    describe('enable/disable', () => {
        it('should not log when disabled', async () => {
            await auditLog.init();
            auditLog.setEnabled(false);

            await auditLog.logCommand('disabled-command', true);

            await new Promise(resolve => setTimeout(resolve, 100));

            const entries = await auditLog.getRecentEntries(10);
            const disabledEntry = entries.find(e => e.command === 'disabled-command');

            expect(disabledEntry).toBeUndefined();

            // Re-enable for other tests
            auditLog.setEnabled(true);
        });
    });
});
