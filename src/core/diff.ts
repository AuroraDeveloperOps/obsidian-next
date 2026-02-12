/**
 * Diff Utility - Generate and store line-level diffs
 *
 * Features:
 * - Unified diff format
 * - Diff storage with timestamps
 * - Auto-cleanup of old diffs
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { config } from './config.js';

const DIFF_DIR = '.obsidian-next/diffs';
const MAX_DIFF_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_DIFFS = 100;

export interface DiffEntry {
	timestamp: string;
	filePath: string;
	beforeLines: number;
	afterLines: number;
	additions: number;
	deletions: number;
	diff: string;
}

export interface DiffHunk {
	oldStart: number;
	oldCount: number;
	newStart: number;
	newCount: number;
	lines: string[];
}

/**
 * Generate a unified diff between two strings
 */
export function generateDiff(
	oldContent: string,
	newContent: string,
	filePath: string
): string {
	const oldLines = oldContent.split('\n');
	const newLines = newContent.split('\n');

	const hunks = computeHunks(oldLines, newLines);

	if (hunks.length === 0) {
		return ''; // No changes
	}

	const header = [`--- a/${filePath}`, `+++ b/${filePath}`];

	const diffLines = [...header];

	for (const hunk of hunks) {
		const hunkHeader = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
		diffLines.push(hunkHeader);
		diffLines.push(...hunk.lines);
	}

	return diffLines.join('\n');
}

/**
 * Compute diff hunks using a simple LCS-based algorithm
 */
function computeHunks(oldLines: string[], newLines: string[]): DiffHunk[] {
	const hunks: DiffHunk[] = [];
	const lcs = computeLCS(oldLines, newLines);

	let oldIdx = 0;
	let newIdx = 0;
	let lcsIdx = 0;

	let currentHunk: DiffHunk | null = null;
	const contextLines = 3;

	while (oldIdx < oldLines.length || newIdx < newLines.length) {
		const lcsLine = lcsIdx < lcs.length ? lcs[lcsIdx] : null;

		const oldMatches =
			lcsLine !== null &&
			oldIdx < oldLines.length &&
			oldLines[oldIdx] === lcsLine;
		const newMatches =
			lcsLine !== null &&
			newIdx < newLines.length &&
			newLines[newIdx] === lcsLine;

		if (oldMatches && newMatches) {
			// Both match - context line
			if (currentHunk) {
				currentHunk.lines.push(` ${oldLines[oldIdx]}`);
				currentHunk.oldCount++;
				currentHunk.newCount++;

				// Check if we should close the hunk
				const remainingChanges = hasMoreChanges(
					oldLines,
					newLines,
					lcs,
					oldIdx + 1,
					newIdx + 1,
					lcsIdx + 1
				);
				if (!remainingChanges || currentHunk.lines.length > 50) {
					hunks.push(currentHunk);
					currentHunk = null;
				}
			}
			oldIdx++;
			newIdx++;
			lcsIdx++;
		} else if (
			!oldMatches &&
			oldIdx < oldLines.length &&
			(lcsLine === null || oldLines[oldIdx] !== lcsLine)
		) {
			// Deletion
			if (!currentHunk) {
				currentHunk = createHunk(oldIdx + 1, newIdx + 1);
			}
			currentHunk.lines.push(`-${oldLines[oldIdx]}`);
			currentHunk.oldCount++;
			oldIdx++;
		} else if (
			!newMatches &&
			newIdx < newLines.length &&
			(lcsLine === null || newLines[newIdx] !== lcsLine)
		) {
			// Addition
			if (!currentHunk) {
				currentHunk = createHunk(oldIdx + 1, newIdx + 1);
			}
			currentHunk.lines.push(`+${newLines[newIdx]}`);
			currentHunk.newCount++;
			newIdx++;
		} else {
			// Edge case - move to next
			if (oldIdx < oldLines.length) oldIdx++;
			if (newIdx < newLines.length) newIdx++;
		}
	}

	if (currentHunk && currentHunk.lines.length > 0) {
		hunks.push(currentHunk);
	}

	return hunks;
}

function createHunk(oldStart: number, newStart: number): DiffHunk {
	return {
		oldStart,
		oldCount: 0,
		newStart,
		newCount: 0,
		lines: []
	};
}

function hasMoreChanges(
	oldLines: string[],
	newLines: string[],
	lcs: string[],
	oldIdx: number,
	newIdx: number,
	lcsIdx: number
): boolean {
	// Look ahead to see if there are more changes within context range
	const lookAhead = 6;

	for (let i = 0; i < lookAhead; i++) {
		const oi = oldIdx + i;
		const ni = newIdx + i;
		const li = lcsIdx + i;

		if (oi >= oldLines.length && ni >= newLines.length) return false;

		const lcsLine = li < lcs.length ? lcs[li] : null;

		if (lcsLine === null) return oi < oldLines.length || ni < newLines.length;

		if (oi < oldLines.length && oldLines[oi] !== lcsLine) return true;
		if (
			ni < newLines.length &&
			ni < newLines.length &&
			newLines[ni] !== lcsLine
		)
			return true;
	}

	return false;
}

/**
 * Compute Longest Common Subsequence (simple implementation)
 */
function computeLCS(a: string[], b: string[]): string[] {
	const m = a.length;
	const n = b.length;

	// For large files, use a simpler approach
	if (m > 1000 || n > 1000) {
		return simpleLCS(a, b);
	}

	const dp: number[][] = Array(m + 1)
		.fill(null)
		.map(() => Array(n + 1).fill(0));

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (a[i - 1] === b[j - 1]) {
				dp[i][j] = dp[i - 1][j - 1] + 1;
			} else {
				dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
			}
		}
	}

	// Backtrack to find LCS
	const lcs: string[] = [];
	let i = m,
		j = n;

	while (i > 0 && j > 0) {
		if (a[i - 1] === b[j - 1]) {
			lcs.unshift(a[i - 1]);
			i--;
			j--;
		} else if (dp[i - 1][j] > dp[i][j - 1]) {
			i--;
		} else {
			j--;
		}
	}

	return lcs;
}

/**
 * Simple LCS for large files - just find common lines
 */
function simpleLCS(a: string[], b: string[]): string[] {
	const bSet = new Set(b);
	return a.filter((line) => bSet.has(line));
}

/**
 * Count additions and deletions in a diff
 */
export function countChanges(diff: string): {
	additions: number;
	deletions: number;
} {
	const lines = diff.split('\n');
	let additions = 0;
	let deletions = 0;

	for (const line of lines) {
		if (line.startsWith('+') && !line.startsWith('+++')) {
			additions++;
		} else if (line.startsWith('-') && !line.startsWith('---')) {
			deletions++;
		}
	}

	return { additions, deletions };
}

/**
 * Diff Manager - Store and retrieve diffs
 */
class DiffManager {
	private diffDir: string | null = null;

	constructor() {}

	private async getDiffDir(): Promise<string> {
		if (this.diffDir) return this.diffDir;
		this.diffDir = path.join(os.homedir(), DIFF_DIR);
		return this.diffDir;
	}

	/**
	 * Save a diff to storage
	 */
	async saveDiff(
		filePath: string,
		oldContent: string,
		newContent: string
	): Promise<DiffEntry | null> {
		const diff = generateDiff(oldContent, newContent, filePath);

		if (!diff) {
			return null; // No changes
		}

		const diffDir = await this.getDiffDir();
		await fs.mkdir(diffDir, { recursive: true });

		const timestamp = new Date().toISOString();
		const { additions, deletions } = countChanges(diff);

		const entry: DiffEntry = {
			timestamp,
			filePath,
			beforeLines: oldContent.split('\n').length,
			afterLines: newContent.split('\n').length,
			additions,
			deletions,
			diff
		};

		// Generate filename from timestamp and file path
		const sanitizedPath = filePath
			.replace(/[/\\]/g, '_')
			.replace(/[^a-zA-Z0-9_.-]/g, '');
		const filename = `${Date.now()}_${sanitizedPath}.diff.json`;

		await fs.writeFile(
			path.join(diffDir, filename),
			JSON.stringify(entry, null, 2)
		);

		// Cleanup old diffs
		await this.cleanup();

		return entry;
	}

	/**
	 * List recent diffs
	 */
	async listDiffs(limit = 20): Promise<DiffEntry[]> {
		try {
			const diffDir = await this.getDiffDir();
			await fs.mkdir(diffDir, { recursive: true });
			const files = await fs.readdir(diffDir);

			const diffs: DiffEntry[] = [];

			for (const file of files.slice(-limit * 2)) {
				if (!file.endsWith('.diff.json')) continue;

				try {
					const content = await fs.readFile(path.join(diffDir, file), 'utf-8');
					diffs.push(JSON.parse(content));
				} catch {
					// Skip invalid files
				}
			}

			// Sort by timestamp, newest first
			return diffs
				.sort(
					(a, b) =>
						new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
				)
				.slice(0, limit);
		} catch {
			return [];
		}
	}

	/**
	 * Get diff for a specific file
	 */
	async getDiffForFile(filePath: string): Promise<DiffEntry | null> {
		const diffs = await this.listDiffs(100);
		return diffs.find((d) => d.filePath === filePath) || null;
	}

	/**
	 * Cleanup old diffs
	 */
	async cleanup(): Promise<void> {
		try {
			const diffDir = await this.getDiffDir();
			const files = await fs.readdir(diffDir);
			const now = Date.now();

			const validFiles: { name: string; time: number }[] = [];

			for (const file of files) {
				if (!file.endsWith('.diff.json')) continue;

				const match = file.match(/^(\d+)_/);
				if (match) {
					const time = parseInt(match[1], 10);

					// Delete if too old
					if (now - time > MAX_DIFF_AGE_MS) {
						await fs.unlink(path.join(diffDir, file));
					} else {
						validFiles.push({ name: file, time });
					}
				}
			}

			// If still too many, delete oldest
			if (validFiles.length > MAX_DIFFS) {
				validFiles.sort((a, b) => a.time - b.time);
				const toDelete = validFiles.slice(0, validFiles.length - MAX_DIFFS);

				for (const { name } of toDelete) {
					await fs.unlink(path.join(diffDir, name));
				}
			}
		} catch {
			// Ignore cleanup errors
		}
	}

	/**
	 * Clear all diffs
	 */
	async clearAll(): Promise<void> {
		try {
			const diffDir = await this.getDiffDir();
			const files = await fs.readdir(diffDir);

			for (const file of files) {
				if (file.endsWith('.diff.json')) {
					await fs.unlink(path.join(diffDir, file));
				}
			}
		} catch {
			// Directory may not exist
		}
	}
}

export const diffManager = new DiffManager();
