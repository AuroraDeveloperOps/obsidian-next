/**
 * Glob Tool - Fast file pattern matching
 */

import fs from 'fs/promises';
import path from 'path';
import { config } from '../../core/config.js';
import { Tool, ToolResult, truncateOutput, IGNORED_DIRS } from '../shared.js';

/**
 * Glob search helper - matches files against patterns
 */
async function globSearch(
	dir: string,
	pattern: string,
	results: string[],
	maxResults: number,
	depth: number = 0,
	workspaceRoot: string = process.cwd()
): Promise<void> {
	if (results.length >= maxResults || depth > 15) return;

	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });

		// Convert glob to regex
		const regexPattern = pattern
			.replace(/\*\*/g, '{{GLOBSTAR}}')
			.replace(/\*/g, '[^/]*')
			.replace(/\?/g, '.')
			.replace(/{{GLOBSTAR}}/g, '.*');
		const regex = new RegExp(`^${regexPattern}$`);

		for (const entry of entries) {
			if (results.length >= maxResults) break;

			// Skip ignored directories
			if (entry.name.startsWith('.') || IGNORED_DIRS.includes(entry.name)) {
				continue;
			}

			const fullPath = path.join(dir, entry.name);
			const relativePath = path.relative(workspaceRoot, fullPath);

			if (entry.isDirectory()) {
				// If pattern starts with **, search subdirs
				if (pattern.includes('**') || pattern.includes('/')) {
					await globSearch(
						fullPath,
						pattern,
						results,
						maxResults,
						depth + 1,
						workspaceRoot
					);
				}
			} else if (entry.isFile()) {
				// Test against pattern
				if (regex.test(relativePath) || regex.test(entry.name)) {
					results.push(relativePath);
				}
			}
		}
	} catch {
		// Skip directories we can't read
	}
}

export const GlobTool: Tool = {
	name: 'glob',
	description:
		'Find files matching a glob pattern (e.g., **/*.ts, src/**/*.tsx)',
	inputSchema: {
		pattern: {
			type: 'string',
			description: 'Glob pattern like **/*.ts or src/**/*.tsx'
		},
		path: {
			type: 'string',
			description: 'Base directory (defaults to current directory)'
		}
	},
	requiredParams: ['pattern'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const pattern = args.pattern as string;
		const basePath = (args.path as string) || '.';

		if (!pattern) {
			return { success: false, error: 'No pattern provided' };
		}

		try {
			const cfg = await config.load();
			const results: string[] = [];
			const fullBase = path.resolve(cfg.workspaceRoot, basePath);
			await globSearch(fullBase, pattern, results, 100, 0, cfg.workspaceRoot);

			if (results.length === 0) {
				return {
					success: true,
					output: `No files matching: ${pattern}`
				};
			}

			return {
				success: true,
				output: truncateOutput(
					`Found ${results.length} files:\n${results.join('\n')}`
				)
			};
		} catch (error: unknown) {
			return {
				success: false,
				error: `Glob failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
};
