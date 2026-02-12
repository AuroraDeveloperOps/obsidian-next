/**
 * List Tool - List files and directories in the workspace
 */

import fs from 'fs/promises';
import path from 'path';
import { auditor } from '../../core/auditor.js';
import { config } from '../../core/config.js';
import { Tool, ToolResult, IGNORED_DIRS } from '../shared.js';

export const ListTool: Tool = {
	name: 'list',
	description: 'List files and directories in the workspace',
	inputSchema: {
		path: {
			type: 'string',
			description: 'Directory path to list (defaults to current directory)'
		}
	},
	requiredParams: [],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const dirPath = (args.path as string) || '.';

		// Path validation
		const pathCheck = auditor.checkPath(dirPath);
		if (!pathCheck.approved) {
			return {
				success: false,
				error: pathCheck.reason
			};
		}

		try {
			const cfg = await config.load();
			const fullPath = path.resolve(cfg.workspaceRoot, dirPath);
			const entries = await fs.readdir(fullPath, { withFileTypes: true });

			// Filter out ignored directories
			const filtered = entries.filter(
				(entry) =>
					!IGNORED_DIRS.includes(entry.name) && !entry.name.startsWith('.')
			);

			const formatted = filtered
				.map((entry) => {
					const prefix = entry.isDirectory() ? '[DIR]' : '[FILE]';
					return `${prefix} ${entry.name}`;
				})
				.join('\n');

			const hiddenCount = entries.length - filtered.length;
			const hiddenNote =
				hiddenCount > 0
					? `\n\n(${hiddenCount} hidden: node_modules, .git, etc.)`
					: '';

			return {
				success: true,
				output: `Directory: ${dirPath}\n${'='.repeat(60)}\n${formatted}${hiddenNote}`
			};
		} catch (error: unknown) {
			return {
				success: false,
				error: `Failed to list directory: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
};
