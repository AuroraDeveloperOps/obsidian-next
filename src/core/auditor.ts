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

    async checkCommand(command: string): Promise<AuditResult> {
        const dangerousPatterns = [
            'rm -rf /',
            'rm -fr /',
            ':(){:|:&};:', // Fork bomb
            '> /dev/sda',   // Disk overwrite
            'mkfs',
            'dd if=',
            'chmod -R 777',
            ':(){ :|:& };:',
        ];

        if (dangerousPatterns.some(p => command.includes(p))) {
            return { approved: false, reason: 'Detected destructive command pattern', isCritical: true };
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
