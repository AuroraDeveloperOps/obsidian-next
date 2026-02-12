/**
 * Read Tool - Read file contents from the workspace
 */

import fs from 'fs/promises';
import path from 'path';
import { auditor } from '../../core/auditor.js';
import { config } from '../../core/config.js';
import { context } from '../../core/context.js';
import { auditLog } from '../../core/auditLog.js';
import {
	Tool,
	ToolResult,
	truncateOutput,
	MAX_FILE_READ_LINES,
	IGNORED_DIRS
} from '../shared.js';

export const ReadTool: Tool = {
	name: 'read',
	description: 'Read file contents from the workspace',
	inputSchema: {
		path: {
			type: 'string',
			description: 'Path to the file to read (relative to workspace)'
		}
	},
	requiredParams: ['path'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const filePath = args.path as string;

		if (!filePath) {
			return { success: false, error: 'No file path provided' };
		}

		// Path validation
		const pathCheck = auditor.checkPath(filePath);
		if (!pathCheck.approved) {
			return {
				success: false,
				error: pathCheck.reason
			};
		}

		// Block reading from ignored directories (node_modules, etc.)
		if (
			IGNORED_DIRS.some(
				(dir) => filePath.includes(`/${dir}/`) || filePath.startsWith(`${dir}/`)
			)
		) {
			return {
				success: false,
				error: `Cannot read from ignored directory. Paths containing ${IGNORED_DIRS.join(', ')} are blocked to prevent context explosion.`
			};
		}

		try {
			const cfg = await config.load();
			const fullPath = path.resolve(cfg.workspaceRoot, filePath);
			const content = await fs.readFile(fullPath, 'utf-8');

			// Add line numbers for better readability
			const lines = content.split('\n');

			// Limit lines to prevent context explosion
			const limitedLines = lines.slice(0, MAX_FILE_READ_LINES);
			const numbered = limitedLines
				.map((line, i) => `${String(i + 1).padStart(4)} | ${line}`)
				.join('\n');

			const truncationNote =
				lines.length > MAX_FILE_READ_LINES
					? `\n\n... [TRUNCATED: ${lines.length - MAX_FILE_READ_LINES} more lines. Use offset parameter to read more.]`
					: '';

			// Track in context and audit log
			await context.trackRead(filePath);
			await auditLog.logFileOperation('read', filePath, true);

			return {
				success: true,
				output: truncateOutput(
					`File: ${filePath} (${lines.length} lines)\n${'='.repeat(60)}\n${numbered}${truncationNote}`
				)
			};
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			await auditLog.logFileOperation('read', filePath, false, msg);
			return {
				success: false,
				error: `Failed to read file: ${msg}`
			};
		}
	}
};
