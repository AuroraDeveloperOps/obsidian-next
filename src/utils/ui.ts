/**
 * UI Utilities for standardizing CLI output
 */

import chalk from 'chalk';

/**
 * Format a standardized section header
 * Style: --- [ Title ] ---
 */
export function formatHeader(title: string): string {
    // Minimal standard: [ Title ]
    // No massive dashed lines, just simple clean text
    const text = chalk.bold.white(`[ ${title} ]`);
    return `\n ${text}\n`;
}

/**
 * Format a standardized section footer
 */
export function formatFooter(): string {
    return `\n${chalk.gray('='.repeat(50))}\n`;
}
