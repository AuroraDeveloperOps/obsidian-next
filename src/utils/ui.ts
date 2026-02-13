/**
 * UI Utilities for standardizing CLI output
 */

import chalk from 'chalk';
import { execSync } from 'child_process';

/**
 * Format a standardized section header
 * Style: --- [ Title ] ---
 */
export function formatHeader(title: string): string {
	return `${chalk.bold.white(title)}\n`;
}

export function formatFooter(): string {
	return ''; // Footers are discouraged in the new aesthetic
}

/**
 * Get the current Git branch name
 */
export function getGitBranch(): string {
	try {
		return execSync('git rev-parse --abbrev-ref HEAD', {
			stdio: ['ignore', 'pipe', 'ignore'],
			encoding: 'utf8'
		}).trim();
	} catch {
		return '';
	}
}
