/**
 * Edit Tool - Modify existing files with search/replace
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

/**
 * Generate a simple diff preview showing what was changed
 */
function generateDiffPreview(search: string, replace: string): string {
	const searchLines = search.split('\n').slice(0, 5);
	const replaceLines = replace.split('\n').slice(0, 5);

	let preview = '';

	// Show removed lines
	for (const line of searchLines) {
		preview += `- ${line}\n`;
	}
	if (search.split('\n').length > 5) {
		preview += `- ... (${search.split('\n').length - 5} more lines)\n`;
	}

	// Show added lines
	for (const line of replaceLines) {
		preview += `+ ${line}\n`;
	}
	if (replace.split('\n').length > 5) {
		preview += `+ ... (${replace.split('\n').length - 5} more lines)\n`;
	}

	return preview.trim();
}

export const EditTool: Tool = {
	name: 'edit',
	description: 'Edit existing files using search and replace',
	inputSchema: {
		path: {
			type: 'string',
			description: 'Path to the file to edit'
		},
		search: {
			type: 'string',
			description: 'Text to search for (must match exactly)'
		},
		replace: {
			type: 'string',
			description: 'Text to replace with'
		}
	},
	requiredParams: ['path', 'search', 'replace'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const filePath = args.path as string;
		const search = args.search as string;
		const replace = args.replace as string;

		if (!filePath) {
			return { success: false, error: 'No file path provided' };
		}

		if (!search) {
			return { success: false, error: 'No search string provided' };
		}

		if (replace === undefined) {
			return { success: false, error: 'No replacement string provided' };
		}

		// File existence and path check
		const fileCheck = await auditor.checkFileEdit(filePath);
		if (!fileCheck.approved) {
			return {
				success: false,
				error: fileCheck.reason
			};
		}

		try {
			const cfg = await config.load();
			const fullPath = path.resolve(cfg.workspaceRoot, filePath);
			const original = await fs.readFile(fullPath, 'utf-8');

			// Check if search string exists
			if (!original.includes(search)) {
				return {
					success: false,
					error: `Search string not found in ${filePath}`
				};
			}

			// Count occurrences for user feedback
			const occurrences = original.split(search).length - 1;

			// Perform replacement - use replaceAll to replace ALL occurrences
			const modified = original.replaceAll(search, replace);

			// Generate diff preview for output
			const diffPreview = generateDiffPreview(search, replace);

			// Write back
			await fs.writeFile(fullPath, modified, 'utf-8');

			// Calculate change stats
			const originalLines = original.split('\n').length;
			const modifiedLines = modified.split('\n').length;
			const delta = modifiedLines - originalLines;

			// Track in context, undo, audit log, and diff
			await context.trackModified(filePath);
			await undo.recordChange(filePath, 'edit', original, modified);
			await auditLog.logFileOperation('edit', filePath, true);
			await diffManager.saveDiff(filePath, original, modified);

			const occurrenceText =
				occurrences > 1 ? ` (${occurrences} occurrences)` : '';
			return {
				success: true,
				output: `Edited ${filePath}${occurrenceText}:\n${diffPreview}\nLines: ${originalLines} -> ${modifiedLines} (${delta >= 0 ? '+' : ''}${delta})`
			};
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			await auditLog.logFileOperation('edit', filePath, false, msg);
			return {
				success: false,
				error: `Failed to edit file: ${msg}`
			};
		}
	}
};
