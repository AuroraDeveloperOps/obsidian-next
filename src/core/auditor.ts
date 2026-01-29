import path from 'path';
import fs from 'fs/promises';

export interface AuditResult {
    approved: boolean;
    reason?: string;
    isCritical?: boolean;
    requiresApproval?: boolean;
}

// Patterns that are ALWAYS blocked (critical security risks)
const BLOCKED_PATTERNS = [
    'rm -rf /',
    'rm -fr /',
    ':(){:|:&};:',      // Fork bomb
    '> /dev/sda',       // Disk overwrite
    'mkfs',
    'dd if=',
    'chmod -R 777',
    ':(){ :|:& };:',
    'curl | sh',        // Pipe to shell
    'wget | sh',
    'curl | bash',
    'wget | bash',
];

// Patterns that require user approval (potentially destructive)
const APPROVAL_PATTERNS = [
    { pattern: 'rm -rf', reason: 'Recursive delete operation' },
    { pattern: 'rm -r', reason: 'Recursive delete operation' },
    { pattern: 'git push --force', reason: 'Force push to remote' },
    { pattern: 'git reset --hard', reason: 'Hard reset (loses changes)' },
    { pattern: 'npm publish', reason: 'Publishing to npm registry' },
    { pattern: 'docker rm', reason: 'Removing Docker containers' },
    { pattern: 'DROP TABLE', reason: 'SQL table deletion' },
    { pattern: 'DROP DATABASE', reason: 'SQL database deletion' },
    { pattern: 'truncate', reason: 'Truncating data' },
];

export class Auditor {
    private workspaceRoot: string;

    constructor(root: string = process.cwd()) {
        this.workspaceRoot = path.resolve(root);
    }

    async checkCommand(command: string): Promise<AuditResult> {
        const lowerCommand = command.toLowerCase();

        // Check for blocked patterns (always denied)
        if (BLOCKED_PATTERNS.some(p => command.includes(p))) {
            return {
                approved: false,
                reason: 'Detected destructive command pattern',
                isCritical: true
            };
        }

        // Check for patterns that require approval
        for (const { pattern, reason } of APPROVAL_PATTERNS) {
            if (lowerCommand.includes(pattern.toLowerCase())) {
                return {
                    approved: true,
                    requiresApproval: true,
                    reason: reason
                };
            }
        }

        return { approved: true };
    }

    checkPath(filePath: string): AuditResult {
        const resolved = path.resolve(this.workspaceRoot, filePath);
        if (!resolved.startsWith(this.workspaceRoot)) {
            return { approved: false, reason: `Path outside workspace: ${filePath}`, isCritical: true };
        }
        return { approved: true };
    }

    async checkFileEdit(filePath: string): Promise<AuditResult> {
        const pathCheck = this.checkPath(filePath);
        if (!pathCheck.approved) return pathCheck;

        try {
            await fs.access(filePath);
            return { approved: true };
        } catch {
            return { approved: false, reason: `File not found: ${filePath}`, isCritical: false };
        }
    }
}

export const auditor = new Auditor();
