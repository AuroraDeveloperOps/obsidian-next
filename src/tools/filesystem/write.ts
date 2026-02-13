/**
 * Write Tool - Create new files in the workspace
 */

import fs from 'fs/promises';
import path from 'path';
import { auditor } from '../../core/auditor.js';
import { config } from '../../core/config.js';
import { context } from '../../core/context.js';
import { undo } from '../../core/undo.js';
import { auditLog } from '../../core/auditLog.js';
import { diffManager } from '../../core/diff.js';
import { Tool, ToolResult } from '../shared.js';

export const WriteTool: Tool = {
	name: 'write',
	description: 'Create new files in the workspace',
	inputSchema: {
		path: {
			type: 'string',
			description: 'Path where to create the new file'
		},
		content: {
			type: 'string',
			description: 'Content to write to the file'
		}
	},
	requiredParams: ['path', 'content'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const filePath = args.path as string;
		const content = args.content as string;

		if (!filePath) {
			return { success: false, error: 'No file path provided' };
		}

		if (content === undefined) {
			return { success: false, error: 'No content provided' };
		}

		// Path validation
		const pathCheck = await auditor.checkPathAsync(filePath);
		if (!pathCheck.approved) {
			return {
				success: false,
				error: pathCheck.reason
			};
		}

		try {
			const cfg = await config.load();
			const fullPath = path.resolve(cfg.workspaceRoot, filePath);

			// Check if file already exists
			try {
				await fs.access(fullPath);
				return {
					success: false,
					error: `File already exists: ${filePath}. Use 'edit' tool to modify.`
				};
			} catch {
				// File doesn't exist, good to proceed
			}

			// Create directory if needed
			await fs.mkdir(path.dirname(fullPath), { recursive: true });

			// Write file
			await fs.writeFile(fullPath, content, 'utf-8');

			// Track in context, undo, audit log, and diff
			await context.trackModified(filePath);
			await undo.recordChange(filePath, 'create', null, content);
			await auditLog.logFileOperation('write', filePath, true);
			await diffManager.saveDiff(filePath, '', content);

			return {
				success: true,
				output: `Created file: ${filePath} (${content.length} bytes)`
			};
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			await auditLog.logFileOperation('write', filePath, false, msg);
			return {
				success: false,
				error: `Failed to write file: ${msg}`
			};
		}
	}
};
