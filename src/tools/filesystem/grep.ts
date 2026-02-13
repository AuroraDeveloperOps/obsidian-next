/**
 * Grep Tool - Search file contents with regex
 */

import fs from 'fs/promises';
import path from 'path';
import { auditor } from '../../core/auditor.js';
import { config } from '../../core/config.js';
import { Tool, ToolResult, truncateOutput, IGNORED_DIRS } from '../shared.js';

/**
 * Recursive directory search helper
 */
async function searchDirectory(
	dir: string,
	pattern: string,
	results: string[],
	maxResults: number,
	depth: number = 0,
	workspaceRoot: string = process.cwd()
): Promise<void> {
	if (results.length >= maxResults || depth > 10) return;

	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		const regex = new RegExp(pattern, 'gi');

		for (const entry of entries) {
			if (results.length >= maxResults) break;

			const fullPath = path.join(dir, entry.name);
			const relativePath = path.relative(workspaceRoot, fullPath);

			// Skip ignored directories (node_modules, .git, etc.)
			if (entry.name.startsWith('.') || IGNORED_DIRS.includes(entry.name)) {
				continue;
			}

			if (entry.isDirectory()) {
				await searchDirectory(
					fullPath,
					pattern,
					results,
					maxResults,
					depth + 1,
					workspaceRoot
				);
			} else if (entry.isFile()) {
				// Only search text files
				const ext = path.extname(entry.name).toLowerCase();
				const textExtensions = [
					'.ts',
					'.tsx',
					'.js',
					'.jsx',
					'.json',
					'.md',
					'.txt',
					'.yaml',
					'.yml',
					'.css',
					'.html',
					'.sh'
				];

				if (textExtensions.includes(ext) || ext === '') {
					try {
						const content = await fs.readFile(fullPath, 'utf-8');
						const lines = content.split('\n');

						for (
							let i = 0;
							i < lines.length && results.length < maxResults;
							i++
						) {
							if (regex.test(lines[i])) {
								results.push(
									`${relativePath}:${i + 1}: ${lines[i].trim().slice(0, 100)}`
								);
							}
							regex.lastIndex = 0; // Reset regex state
						}
					} catch {
						// Skip binary or unreadable files
					}
				}
			}
		}
	} catch {
		// Skip directories we can't read
	}
}

export const GrepTool: Tool = {
	name: 'grep',
	description: 'Search for patterns in files using regex',
	inputSchema: {
		pattern: {
			type: 'string',
			description: 'Regex pattern to search for'
		},
		path: {
			type: 'string',
			description: 'Directory to search in (defaults to current directory)'
		},
		limit: {
			type: 'number',
			description: 'Maximum number of results (default: 50)'
		}
	},
	requiredParams: ['pattern'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const pattern = args.pattern as string;
		const searchPath = (args.path as string) || '.';
		const maxResults = (args.limit as number) || 50;

		if (!pattern) {
			return { success: false, error: 'No search pattern provided' };
		}

		// Path validation
		const pathCheck = await auditor.checkPathAsync(searchPath);
		if (!pathCheck.approved) {
			return {
				success: false,
				error: pathCheck.reason
			};
		}

		try {
			const cfg = await config.load();
			const fullPath = path.resolve(cfg.workspaceRoot, searchPath);
			const results: string[] = [];

			// Use recursive search
			await searchDirectory(
				fullPath,
				pattern,
				results,
				maxResults,
				0,
				cfg.workspaceRoot
			);

			if (results.length === 0) {
				return {
					success: true,
					output: `No matches found for: ${pattern}`
				};
			}

			return {
				success: true,
				output: truncateOutput(
					`Found ${results.length} matches for "${pattern}":\n${'='.repeat(60)}\n${results.join('\n')}`
				)
			};
		} catch (error: unknown) {
			return {
				success: false,
				error: `Search failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
};
