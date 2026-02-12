// src/computer/utils.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Wait for a specified duration
 * @param duration - Duration in milliseconds
 */
export async function wait(duration: number): Promise<void> {
	// Use JS Promise instead of shell sleep for millisecond precision
	await new Promise((resolve) => setTimeout(resolve, duration));
}
