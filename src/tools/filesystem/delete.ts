/**
 * Delete Tool - Delete files or directories from the workspace
 */

import fs from 'fs/promises';
import path from 'path';
import { auditor } from '../../core/auditor.js';
import { config } from '../../core/config.js';
import { context } from '../../core/context.js';
import { undo } from '../../core/undo.js';
import { auditLog } from '../../core/auditLog.js';
import { Tool, ToolResult } from '../shared.js';

export const DeleteTool: Tool = {
	name: 'delete',
	description:
		'Delete a file or directory from the workspace. Requires approval in safe mode. Cannot delete .git, node_modules, or files outside workspace.',
	inputSchema: {
		path: {
			type: 'string',
			description:
				'Path to the file or directory to delete (relative to workspace)'
		}
	},
	requiredParams: ['path'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const filePath = args.path as string;

		if (!filePath) {
			return { success: false, error: 'No path provided' };
		}

		// Path validation
		const pathCheck = auditor.checkPath(filePath);
		if (!pathCheck.approved) {
			return { success: false, error: pathCheck.reason };
		}

		// Block critical paths
		const blocked = [
			'.git',
			'node_modules',
			'.env',
			'package-lock.json',
			'yarn.lock'
		];
		const basename = path.basename(filePath);
		const normalized = filePath.replace(/\\/g, '/');

		if (
			blocked.includes(basename) ||
			blocked.some((b) => normalized.startsWith(b + '/') || normalized === b)
		) {
			return {
				success: false,
				error: `Cannot delete protected path: ${filePath}`
			};
		}

		// Block system-level paths
		const cfg = await config.load();
		const fullPath = path.resolve(cfg.workspaceRoot, filePath);
		const relative = path.relative(cfg.workspaceRoot, fullPath);
		if (relative.startsWith('..')) {
			return {
				success: false,
				error: 'Cannot delete files outside workspace'
			};
		}

		try {
			const stat = await fs.stat(fullPath);
			const isDir = stat.isDirectory();

			if (isDir) {
				await fs.rm(fullPath, { recursive: true });
			} else {
				// Record undo for file deletions
				const content = await fs.readFile(fullPath, 'utf-8').catch(() => null);
				await fs.unlink(fullPath);
				if (content !== null) {
					await undo.recordChange(filePath, 'delete', content, null);
				}
			}

			await context.trackModified(filePath);
			await auditLog.logFileOperation('delete', filePath, true);

			return {
				success: true,
				output: `Deleted ${isDir ? 'directory' : 'file'}: ${filePath}`
			};
		} catch (error: unknown) {
			await auditLog.logFileOperation(
				'delete',
				filePath,
				false,
				error instanceof Error ? error.message : String(error)
			);
			return {
				success: false,
				error: `Failed to delete: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
};
