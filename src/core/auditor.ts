import path from 'path';
import fs from 'fs/promises';
import { settings } from './settings.js';

export interface AuditResult {
    approved: boolean;
    reason?: string;
    isCritical?: boolean;
    requiresApproval?: boolean;
    autoApproved?: boolean;
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
];

// Regex patterns for more complex dangerous commands
const BLOCKED_REGEX_PATTERNS = [
    /curl\s+[^\|]+\|\s*(sh|bash)/i,     // curl URL | sh/bash
    /wget\s+[^\|]+\|\s*(sh|bash)/i,     // wget URL | sh/bash
    /curl\s*\|\s*(sh|bash)/i,           // curl | sh/bash (direct)
    /wget\s*\|\s*(sh|bash)/i,           // wget | sh/bash (direct)
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

        // Check for blocked string patterns (always denied - hardcoded safety)
        if (BLOCKED_PATTERNS.some(p => command.includes(p))) {
            return {
                approved: false,
                reason: 'Detected destructive command pattern',
                isCritical: true
            };
        }

        // Check for blocked regex patterns (e.g., curl URL | sh)
        if (BLOCKED_REGEX_PATTERNS.some(p => p.test(command))) {
            return {
                approved: false,
                reason: 'Detected dangerous pipe-to-shell pattern',
                isCritical: true
            };
        }

        // Check settings deny list
        if (await settings.isDenied('bash', command)) {
            return {
                approved: false,
                reason: 'Command blocked by settings',
                isCritical: false
            };
        }

        // Check settings allow list - if allowed, skip approval
        if (await settings.isAllowed('bash', command)) {
            return {
                approved: true,
                autoApproved: true
            };
        }

        // Check for patterns that require approval
        for (const { pattern, reason } of APPROVAL_PATTERNS) {
            if (lowerCommand.includes(pattern.toLowerCase())) {
                // Return approved: false to signal that approval is REQUIRED
                // The tools layer will request user approval before execution
                return {
                    approved: false,
                    requiresApproval: true,
                    reason: reason
                };
            }
        }

        // Check mode - in safe mode, everything needs approval
        const s = await settings.load();
        if (s.mode === 'safe') {
            // Return approved: false to enforce approval in safe mode
            return {
                approved: false,
                requiresApproval: true,
                reason: 'Safe mode requires approval for all commands'
            };
        }

        return { approved: true };
    }

    checkPath(filePath: string): AuditResult {
        const resolved = path.resolve(this.workspaceRoot, filePath);
        const relative = path.relative(this.workspaceRoot, resolved);

        if (relative.startsWith('..') || path.isAbsolute(relative)) {
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
