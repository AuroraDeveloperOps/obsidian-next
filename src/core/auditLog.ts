/**
 * Audit Logger - Security and Accountability Logging
 *
 * Logs all command executions, tool invocations, and approval decisions
 * to a secure, append-only log file.
 *
 * Log location: .obsidian/audit.log
 */

import fs from 'fs/promises';
import path from 'path';
import { settings } from './settings.js';
import { redactor } from './redactor.js';

export type AuditEventType =
    | 'command_executed'
    | 'command_blocked'
    | 'command_denied'
    | 'approval_requested'
    | 'approval_granted'
    | 'approval_denied'
    | 'approval_timeout'
    | 'file_read'
    | 'file_write'
    | 'file_edit'
    | 'file_delete'
    | 'session_start'
    | 'session_end'
    | 'security_violation'
    | 'pii_redacted';

export interface AuditEntry {
    timestamp: string;
    sessionId: string;
    eventType: AuditEventType;
    tool?: string;
    command?: string;
    filePath?: string;
    reason?: string;
    success: boolean;
    metadata?: Record<string, any>;
}

const LOG_DIR = '.obsidian';
const LOG_FILE = 'audit.log';
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB before rotation

class AuditLogger {
    private logPath: string;
    private sessionId: string;
    private enabled: boolean = true;
    private writeQueue: AuditEntry[] = [];
    private isWriting: boolean = false;

    constructor() {
        this.logPath = path.join(process.cwd(), LOG_DIR, LOG_FILE);
        this.sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    /**
     * Initialize the audit logger
     */
    async init(): Promise<void> {
        const s = await settings.load();
        this.enabled = s.security?.auditLogging ?? true;

        if (!this.enabled) return;

        // Ensure log directory exists
        const dir = path.dirname(this.logPath);
        await fs.mkdir(dir, { recursive: true });

        // Check if log needs rotation
        await this.rotateIfNeeded();

        // Log session start
        await this.log({
            eventType: 'session_start',
            success: true,
            metadata: {
                cwd: process.cwd(),
                pid: process.pid,
                nodeVersion: process.version,
            },
        });
    }

    /**
     * Set the session ID (called from agent)
     */
    setSessionId(sessionId: string): void {
        this.sessionId = sessionId;
    }

    /**
     * Enable or disable logging
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Log a command execution
     */
    async logCommand(command: string, success: boolean, reason?: string): Promise<void> {
        await this.log({
            eventType: success ? 'command_executed' : 'command_blocked',
            tool: 'bash',
            command: redactor.redact(command).text,
            success,
            reason,
        });
    }

    /**
     * Log a file operation
     */
    async logFileOperation(
        operation: 'read' | 'write' | 'edit' | 'delete',
        filePath: string,
        success: boolean,
        reason?: string
    ): Promise<void> {
        const eventMap: Record<string, AuditEventType> = {
            read: 'file_read',
            write: 'file_write',
            edit: 'file_edit',
            delete: 'file_delete',
        };

        await this.log({
            eventType: eventMap[operation],
            filePath,
            success,
            reason,
        });
    }

    /**
     * Log an approval decision
     */
    async logApproval(
        status: 'requested' | 'granted' | 'denied' | 'timeout',
        command: string,
        reason?: string
    ): Promise<void> {
        const eventMap: Record<string, AuditEventType> = {
            requested: 'approval_requested',
            granted: 'approval_granted',
            denied: 'approval_denied',
            timeout: 'approval_timeout',
        };

        await this.log({
            eventType: eventMap[status],
            command,
            success: status === 'granted',
            reason,
        });
    }

    /**
     * Log a security violation
     */
    async logSecurityViolation(command: string, reason: string): Promise<void> {
        await this.log({
            eventType: 'security_violation',
            command,
            success: false,
            reason,
        });
    }

    /**
     * Log a system event
     */
    async logSystemEvent(event: string, metadata: Record<string, any>): Promise<void> {
        await this.log({
            eventType: 'security_violation', // Mapping generic system events to generic log type for now, or add new type
            command: event,
            success: false, // Usually error events
            reason: JSON.stringify(metadata),
        });
    }

    /**
     * Log PII redaction
     */
    async logRedaction(count: number, types: string[]): Promise<void> {
        await this.log({
            eventType: 'pii_redacted',
            success: true,
            metadata: { count, types },
        });
    }

    /**
     * Core logging function
     */
    private async log(entry: Omit<AuditEntry, 'timestamp' | 'sessionId'>): Promise<void> {
        if (!this.enabled) return;

        const fullEntry: AuditEntry = {
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            ...entry,
        };

        // Add to write queue
        this.writeQueue.push(fullEntry);

        // Process queue if not already writing
        if (!this.isWriting) {
            await this.processQueue();
        }
    }

    /**
     * Process the write queue
     */
    private async processQueue(): Promise<void> {
        if (this.isWriting || this.writeQueue.length === 0) return;

        this.isWriting = true;

        try {
            // Batch write all queued entries
            const entries = [...this.writeQueue];
            this.writeQueue = [];

            const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';

            await fs.appendFile(this.logPath, lines, { encoding: 'utf-8', mode: 0o600 });
        } catch (error) {
            // Logging should not throw - silently fail
            // Re-add entries to queue for retry
            // But avoid infinite loops by limiting retries
        } finally {
            this.isWriting = false;

            // Process any entries that arrived while we were writing
            if (this.writeQueue.length > 0) {
                setImmediate(() => this.processQueue());
            }
        }
    }

    /**
     * Rotate log file if too large
     */
    private async rotateIfNeeded(): Promise<void> {
        try {
            const stats = await fs.stat(this.logPath);
            if (stats.size >= MAX_LOG_SIZE) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const rotatedPath = this.logPath.replace('.log', `.${timestamp}.log`);
                await fs.rename(this.logPath, rotatedPath);

                // Keep only last 5 rotated logs
                await this.cleanupOldLogs();
            }
        } catch {
            // File doesn't exist yet, nothing to rotate
        }
    }

    /**
     * Clean up old rotated log files
     */
    private async cleanupOldLogs(): Promise<void> {
        try {
            const dir = path.dirname(this.logPath);
            const files = await fs.readdir(dir);
            const auditLogs = files
                .filter(f => f.startsWith('audit.') && f.endsWith('.log') && f !== 'audit.log')
                .sort()
                .reverse();

            // Keep only last 5
            for (const file of auditLogs.slice(5)) {
                await fs.unlink(path.join(dir, file));
            }
        } catch {
            // Cleanup is best-effort
        }
    }

    /**
     * Get recent audit entries formatted for display
     */
    async getRecentActivities(count: number = 50): Promise<Array<{ timestamp: string; content: string; color: string }>> {
        const entries = await this.getRecentEntries(count);
        return entries.map(entry => {
            let content = '';
            let color = 'white'; // Default color

            // Basic formatting based on eventType
            switch (entry.eventType) {
                case 'command_executed':
                    content = `CMD: ${entry.command || 'unknown command'}`;
                    color = 'blue';
                    break;
                case 'command_blocked':
                case 'command_denied':
                case 'security_violation':
                    content = `SECURITY: ${entry.reason || entry.command || 'security event'}`;
                    color = 'red';
                    break;
                case 'approval_requested':
                    content = `APPROVAL: Requested for "${entry.command || 'action'}"`;
                    color = 'yellow';
                    break;
                case 'approval_granted':
                    content = `APPROVAL: Granted for "${entry.command || 'action'}"`;
                    color = 'green';
                    break;
                case 'approval_denied':
                    content = `APPROVAL: Denied for "${entry.command || 'action'}"`;
                    color = 'red';
                    break;
                case 'file_read':
                    content = `FILE: Read ${entry.filePath}`;
                    color = 'cyan';
                    break;
                case 'file_write':
                    content = `FILE: Wrote ${entry.filePath}`;
                    color = 'magenta';
                    break;
                case 'file_edit':
                    content = `FILE: Edited ${entry.filePath}`;
                    color = 'magentaBright';
                    break;
                case 'file_delete':
                    content = `FILE: Deleted ${entry.filePath}`;
                    color = 'redBright';
                    break;
                case 'session_start':
                    content = `SESSION: Started`;
                    color = 'green';
                    break;
                case 'session_end':
                    content = `SESSION: Ended`;
                    color = 'gray';
                    break;
                case 'pii_redacted':
                    content = `SECURITY: PII Redacted (${entry.metadata?.count || 0} items)`;
                    color = 'yellow';
                    break;
                default:
                    content = `EVENT: ${entry.eventType}`;
                    break;
            }

            // Shorten file paths for readability if they are very long
            if (entry.filePath && entry.filePath.length > 50) {
                content = content.replace(entry.filePath, `...${entry.filePath.slice(-47)}`);
            }

            return {
                timestamp: new Date(entry.timestamp).toLocaleTimeString(),
                content: content,
                color: color,
            };
        }).reverse(); // Display newest first
    }

    /**
     * Get recent audit entries
     */
    async getRecentEntries(count: number = 100): Promise<AuditEntry[]> {
        try {
            const content = await fs.readFile(this.logPath, 'utf-8');
            const lines = content.trim().split('\n').filter(l => l);
            const entries = lines.slice(-count).map(line => {
                try {
                    return JSON.parse(line) as AuditEntry;
                } catch {
                    return null;
                }
            }).filter((e): e is AuditEntry => e !== null);

            return entries;
        } catch {
            return [];
        }
    }

    /**
     * Get recent audit entries formatted for display
     */
    async getRecentActivities(count: number = 50): Promise<Array<{ timestamp: string; content: string; color: string }>> {
        const entries = await this.getRecentEntries(count);
        return entries.map(entry => {
            let content = '';
            let color = 'white'; // Default color

            // Basic formatting based on eventType
            switch (entry.eventType) {
                case 'command_executed':
                    content = `CMD: ${entry.command || 'unknown command'}`;
                    color = 'blue';
                    break;
                case 'command_blocked':
                case 'command_denied':
                case 'security_violation':
                    content = `SECURITY: ${entry.reason || entry.command || 'security event'}`;
                    color = 'red';
                    break;
                case 'approval_requested':
                    content = `APPROVAL: Requested for "${entry.command || 'action'}"`;
                    color = 'yellow';
                    break;
                case 'approval_granted':
                    content = `APPROVAL: Granted for "${entry.command || 'action'}"`;
                    color = 'green';
                    break;
                case 'approval_denied':
                    content = `APPROVAL: Denied for "${entry.command || 'action'}"`;
                    color = 'red';
                    break;
                case 'file_read':
                    content = `FILE: Read ${entry.filePath}`;
                    color = 'cyan';
                    break;
                case 'file_write':
                    content = `FILE: Wrote ${entry.filePath}`;
                    color = 'magenta';
                    break;
                case 'file_edit':
                    content = `FILE: Edited ${entry.filePath}`;
                    color = 'magentaBright';
                    break;
                case 'file_delete':
                    content = `FILE: Deleted ${entry.filePath}`;
                    color = 'redBright';
                    break;
                case 'session_start':
                    content = `SESSION: Started`;
                    color = 'green';
                    break;
                case 'session_end':
                    content = `SESSION: Ended`;
                    color = 'gray';
                    break;
                case 'pii_redacted':
                    content = `SECURITY: PII Redacted (${entry.metadata?.count || 0} items)`;
                    color = 'yellow';
                    break;
                default:
                    content = `EVENT: ${entry.eventType}`;
                    break;
            }

            // Shorten file paths for readability if they are very long
            if (entry.filePath && entry.filePath.length > 50) {
                content = content.replace(entry.filePath, `...${entry.filePath.slice(-47)}`);
            }

            return {
                timestamp: new Date(entry.timestamp).toLocaleTimeString(),
                content: content,
                color: color,
            };
        }).reverse(); // Display newest first
    }

    /**
     * Search audit log by event type or command
     */
    async search(query: { eventType?: AuditEventType; command?: string; since?: Date }): Promise<AuditEntry[]> {
        const entries = await this.getRecentEntries(1000);

        return entries.filter(e => {
            if (query.eventType && e.eventType !== query.eventType) return false;
            if (query.command && (!e.command || !e.command.includes(query.command))) return false;
            if (query.since && new Date(e.timestamp) < query.since) return false;
            return true;
        });
    }

    /**
     * Log session end (call on shutdown)
     */
    async close(): Promise<void> {
        if (!this.enabled) return;

        await this.log({
            eventType: 'session_end',
            success: true,
        });

        // Ensure all writes complete
        await this.processQueue();
    }
}

export const auditLog = new AuditLogger();
