/**
 * Shared utilities and types for all tools
 */

import { bus } from '../core/bus.js';
import { UserEvent } from '../events/types.js';

// Safety limits to prevent context explosion
export const MAX_OUTPUT_LENGTH = 10000; // Max chars in tool output
export const MAX_FILE_READ_LINES = 500; // Max lines when reading files
export const IGNORED_DIRS = [
	'node_modules',
	'.git',
	'dist',
	'.next',
	'__pycache__',
	'.cache',
	'coverage'
];

// Approval request timeout (30 seconds)
export const APPROVAL_TIMEOUT = 30000;

// Track the last screenshot scale for coordinate transformation in ComputerUseTool
// This allows coordinate scaling to work even without pilot mode enabled
export let lastScreenshotScale = 1.0;

export function setLastScreenshotScale(scale: number): void {
	lastScreenshotScale = scale;
}

/**
 * Truncate output to prevent context explosion
 */
export function truncateOutput(
	output: string,
	maxLength: number = MAX_OUTPUT_LENGTH
): string {
	if (output.length <= maxLength) return output;
	const truncated = output.slice(0, maxLength);
	const remaining = output.length - maxLength;
	return `${truncated}\n\n... [TRUNCATED: ${remaining} more characters]`;
}

/**
 * Filter out known harmless system noise from stderr
 * These are OS-level messages that don't indicate actual errors
 */
export function filterSystemNoise(stderr: string): string {
	if (!stderr) return stderr;

	const noisePatterns = [
		/^aks:aks_get_lock_state:\d+:\d+: aks connection failed\s*/gm, // macOS keychain noise
		/^objc\[\d+\]: .* may have been in progress in another thread.*$/gm, // Objective-C runtime
		/^Warning: .* is deprecated.*$/gm, // Deprecation warnings
		/^\[warn\].*$/gim, // Generic warn prefixes
		/^MESA-LOADER:.*$/gm, // Mesa graphics loader
		/^libEGL warning:.*$/gm, // EGL warnings
		/^Fontconfig warning:.*$/gm // Font config
	];

	let filtered = stderr;
	for (const pattern of noisePatterns) {
		filtered = filtered.replace(pattern, '');
	}

	// Clean up empty lines left behind
	filtered = filtered.replace(/^\s*[\r\n]/gm, '').trim();

	return filtered;
}

// Pending approval requests
const pendingApprovals = new Map<
	string,
	{
		resolve: (result: {
			approved: boolean;
			scope: 'session' | 'persistent';
			bypass?: boolean;
		}) => void;
		timeout: NodeJS.Timeout;
	}
>();

// Listen for approval responses
bus.on('user', (event: UserEvent) => {
	if (event.type === 'approval_response') {
		const pending = pendingApprovals.get(event.requestId);
		if (pending) {
			clearTimeout(pending.timeout);
			pendingApprovals.delete(event.requestId);
			pending.resolve({
				approved: event.approved,
				scope: event.scope,
				bypass: event.bypass
			});
		}
	}
});

/**
 * Request user approval for a command
 *
 * Displays a clear, actionable permission prompt to the user with:
 * - The exact command to be executed
 * - Why approval is needed
 * - Clear action options
 */
export async function requestApproval(
	command: string,
	reason: string
): Promise<{
	approved: boolean;
	scope: 'session' | 'persistent';
	bypass?: boolean;
}> {
	const requestId = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

	return new Promise((resolve) => {
		// Set timeout - auto-deny after timeout
		const timeout = setTimeout(() => {
			pendingApprovals.delete(requestId);
			bus.emitAgent({
				type: 'error',
				message: 'No response received. Command blocked for safety.'
			});
			resolve({ approved: false, scope: 'session' });
		}, APPROVAL_TIMEOUT);

		pendingApprovals.set(requestId, { resolve, timeout });

		// Format context clearly
		const context = [`Command: ${command}`, `Reason: ${reason}`].join('\n');

		bus.emitAgent({
			type: 'approval_request',
			requestId,
			context
		});
	});
}

/** Structured content block for tool results (text or image) */
export type ToolContentBlock =
	| { type: 'text'; text: string }
	| { type: 'image'; data: string; mimeType: string };

export interface ToolResult {
	success: boolean;
	output?: string;
	error?: string;
	content?: ToolContentBlock[];
}

/** Schema definition for a single tool parameter */
export interface ToolParameterSchema {
	type: string;
	description: string;
	enum?: string[];
	items?: { type: string };
}

export interface Tool {
	name: string;
	description: string;
	inputSchema: Record<string, ToolParameterSchema>;
	requiredParams: string[];
	execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}
