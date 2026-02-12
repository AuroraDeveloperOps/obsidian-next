/**
 * UI Utilities for standardizing CLI output
 */

import chalk from 'chalk';

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
