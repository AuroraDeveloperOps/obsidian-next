/**
 * Undo System - Track and revert file changes
 * Uses Postgres for persistence, in-memory for speed
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { bus } from './bus.js';

export interface Change {
    id: string;
    filePath: string;
    operation: 'create' | 'edit' | 'delete';
    beforeContent: string | null;
    afterContent: string | null;
    timestamp: Date;
    undone: boolean;
}

class UndoManager {
    private prisma: PrismaClient | null = null;
    private sessionId: string | null = null;
    private changes: Change[] = []; // In-memory stack for fast access
    private dbEnabled = false;

    async init(sessionId: string): Promise<void> {
        this.sessionId = sessionId;

        // Try to connect to Postgres
        try {
            this.prisma = new PrismaClient();
            await this.prisma.$connect();
            this.dbEnabled = true;

            // Load recent changes from DB
            const dbChanges = await this.prisma.fileChange.findMany({
                where: { sessionId, undone: false },
                orderBy: { createdAt: 'desc' },
                take: 50,
            });

            this.changes = dbChanges.map(c => ({
                id: c.id,
                filePath: c.filePath,
                operation: c.operation as Change['operation'],
                beforeContent: c.beforeContent,
                afterContent: c.afterContent,
                timestamp: c.createdAt,
                undone: c.undone,
            }));
        } catch {
            // Postgres not available - use in-memory only
            this.dbEnabled = false;
            this.changes = [];
        }
    }

    async recordChange(
        filePath: string,
        operation: Change['operation'],
        beforeContent: string | null,
        afterContent: string | null
    ): Promise<string> {
        const id = `chg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        const change: Change = {
            id,
            filePath: path.relative(process.cwd(), path.resolve(filePath)),
            operation,
            beforeContent,
            afterContent,
            timestamp: new Date(),
            undone: false,
        };

        // Add to in-memory stack
        this.changes.unshift(change);

        // Persist to DB if available
        if (this.dbEnabled && this.prisma && this.sessionId) {
            try {
                await this.prisma.fileChange.create({
                    data: {
                        id,
                        sessionId: this.sessionId,
                        filePath: change.filePath,
                        operation,
                        beforeContent,
                        afterContent,
                    },
                });
            } catch {
                // DB write failed, but in-memory is fine
            }
        }

        // Keep stack bounded
        if (this.changes.length > 100) {
            this.changes = this.changes.slice(0, 100);
        }

        return id;
    }

    async undo(count: number = 1): Promise<{ success: boolean; message: string }> {
        const toUndo = this.changes.filter(c => !c.undone).slice(0, count);

        if (toUndo.length === 0) {
            return { success: false, message: 'Nothing to undo' };
        }

        const results: string[] = [];

        for (const change of toUndo) {
            try {
                const fullPath = path.resolve(process.cwd(), change.filePath);

                switch (change.operation) {
                    case 'create':
                        // Undo create = delete the file
                        await fs.unlink(fullPath);
                        results.push(`Deleted: ${change.filePath}`);
                        break;

                    case 'edit':
                        // Undo edit = restore before content
                        if (change.beforeContent !== null) {
                            await fs.writeFile(fullPath, change.beforeContent, 'utf-8');
                            results.push(`Restored: ${change.filePath}`);
                        }
                        break;

                    case 'delete':
                        // Undo delete = restore the file
                        if (change.beforeContent !== null) {
                            await fs.mkdir(path.dirname(fullPath), { recursive: true });
                            await fs.writeFile(fullPath, change.beforeContent, 'utf-8');
                            results.push(`Restored: ${change.filePath}`);
                        }
                        break;
                }

                // Mark as undone
                change.undone = true;

                // Update DB if available
                if (this.dbEnabled && this.prisma) {
                    await this.prisma.fileChange.update({
                        where: { id: change.id },
                        data: { undone: true },
                    }).catch(() => {});
                }
            } catch (error: any) {
                results.push(`Failed: ${change.filePath} - ${error.message}`);
            }
        }

        return {
            success: true,
            message: results.join('\n'),
        };
    }

    getHistory(limit: number = 10): Change[] {
        return this.changes.filter(c => !c.undone).slice(0, limit);
    }

    async close(): Promise<void> {
        if (this.prisma) {
            await this.prisma.$disconnect();
        }
    }
}

export const undo = new UndoManager();
