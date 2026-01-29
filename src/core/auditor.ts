import path from 'path';
import fs from 'fs/promises';
import { bus } from './bus.js';

export interface AuditResult {
    approved: boolean;
    reason?: string;
    isCritical?: boolean;
}

export class Auditor {
    private workspaceRoot: string;

    constructor(root: string = process.cwd()) {
        this.workspaceRoot = path.resolve(root);
    }

    /**
     * Checks if a shell command is safe to run.
     */
    async checkCommand(command: string): Promise<AuditResult> {
        const dangerousPatterns = [
            'rm -rf /',
            'rm -fr /',
            ':(){:|:&};:', // Fork bomb
            '> /dev/sda',   // Disk overwrite
            'mkfs',
        ];

        if (dangerousPatterns.some(p => command.includes(p))) {
            return { approved: false, reason: 'Detected highly destructive command pattern.', isCritical: true };
        }

        // Default to requiring confirmation for everything in this early version
        return { approved: false, reason: 'All commands require user confirmation in this mode.', isCritical: false };
    }

    /**
     * Checks if a file path is safe (within workspace).
     */
    checkPath(filePath: string): AuditResult {
        const resolved = path.resolve(this.workspaceRoot, filePath);
        if (!resolved.startsWith(this.workspaceRoot)) {
            return { approved: false, reason: `Path traversal detected: ${filePath} is outside workspace.`, isCritical: true };
        }
        return { approved: true };
    }

    /**
     * Pre-flight check for file edits.
     * Ensures the file exists logic match.
     */
    async checkFileEdit(filePath: string): Promise<AuditResult> {
        const pathCheck = this.checkPath(filePath);
        if (!pathCheck.approved) return pathCheck;

        try {
            await fs.access(filePath);
            return { approved: true };
        } catch {
            return { approved: false, reason: `File not found: ${filePath}. Create it first?`, isCritical: false };
        }
    }
}

export const auditor = new Auditor();
