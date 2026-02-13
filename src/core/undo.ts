/**
 * Undo System - Track and revert file changes
 * Uses Postgres for persistence, in-memory for speed
 */

import fs from 'fs/promises';
import path from 'path';
import { bus } from './bus.js';
import { config } from './config.js';
import { usage } from './usage.js';

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
	private sessionId: string | null = null;
	private changes: Change[] = []; // In-memory stack for fast access

	async init(sessionId: string): Promise<void> {
		this.sessionId = sessionId;
		this.changes = [];
	}

	async recordChange(
		filePath: string,
		operation: Change['operation'],
		beforeContent: string | null,
		afterContent: string | null
	): Promise<string> {
		const id = `chg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
		const cfg = await config.load();

		const change: Change = {
			id,
			filePath: path.relative(cfg.workspaceRoot, path.resolve(filePath)),
			operation,
			beforeContent,
			afterContent,
			timestamp: new Date(),
			undone: false
		};

		// Track diff stats
		let added = 0;
		let deleted = 0;

		if (operation === 'create' && afterContent) {
			added = afterContent.split('\n').length;
		} else if (operation === 'delete' && beforeContent) {
			deleted = beforeContent.split('\n').length;
		} else if (operation === 'edit' && beforeContent !== null && afterContent !== null) {
			const beforeLines = beforeContent.split('\n');
			const afterLines = afterContent.split('\n');
			
			// Simple heuristic for line diffs
			// (Real diffing is complex, this gives a good enough "work done" indicator)
			added = Math.max(0, afterLines.length - beforeLines.length);
			deleted = Math.max(0, beforeLines.length - afterLines.length);
			
			// If length is same but content changed, count at least 1 line
			if (added === 0 && deleted === 0 && beforeContent !== afterContent) {
				added = 1;
				deleted = 1;
			}
		}
		usage.trackDiff(added, deleted);

		// Add to in-memory stack
		this.changes.unshift(change);

		// Keep stack bounded
		if (this.changes.length > 100) {
			this.changes = this.changes.slice(0, 100);
		}

		return id;
	}

	async undo(
		count: number = 1
	): Promise<{ success: boolean; message: string }> {
		const toUndo = this.changes.filter((c) => !c.undone).slice(0, count);

		if (toUndo.length === 0) {
			return { success: false, message: 'Nothing to undo' };
		}

		const results: string[] = [];
		const cfg = await config.load();

		for (const change of toUndo) {
			try {
				const fullPath = path.resolve(cfg.workspaceRoot, change.filePath);

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
			} catch (error: any) {
				results.push(`Failed: ${change.filePath} - ${error.message}`);
			}
		}

		return {
			success: true,
			message: results.join('\n')
		};
	}

	getHistory(limit: number = 10): Change[] {
		return this.changes.filter((c) => !c.undone).slice(0, limit);
	}

	async close(): Promise<void> {
		// No DB to close
	}
}

export const undo = new UndoManager();
