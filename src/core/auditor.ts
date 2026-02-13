import path from 'path';
import fs from 'fs/promises';
import { settings } from './settings.js';
import { commandValidator } from './command-validator.js';

export interface AuditResult {
	approved: boolean;
	reason?: string;
	isCritical?: boolean;
	requiresApproval?: boolean;
	autoApproved?: boolean;
}

// Patterns that are ALWAYS blocked (critical security risks)
const BLOCKED_PATTERNS = [
	'rm -rf /',
	'rm -fr /',
	':(){:|:&};:', // Fork bomb
	'> /dev/sda', // Disk overwrite
	'mkfs',
	'dd if=',
	'chmod -R 777',
	':(){ :|:& };:'
];

// Regex patterns for more complex dangerous commands
const BLOCKED_REGEX_PATTERNS = [
	/curl\s+[^\|]+\|\s*(sh|bash)/i, // curl URL | sh/bash
	/wget\s+[^\|]+\|\s*(sh|bash)/i, // wget URL | sh/bash
	/curl\s*\|\s*(sh|bash)/i, // curl | sh/bash (direct)
	/wget\s*\|\s*(sh|bash)/i // wget | sh/bash (direct)
];

// Patterns that require user approval (potentially destructive)
const APPROVAL_PATTERNS = [
	{ pattern: 'rm -rf', reason: 'Recursive delete operation' },
	{ pattern: 'rm -r', reason: 'Recursive delete operation' },
	{ pattern: 'git push --force', reason: 'Force push to remote' },
	{ pattern: 'git reset --hard', reason: 'Hard reset (loses changes)' },
	{ pattern: 'npm publish', reason: 'Publishing to npm registry' },
	{ pattern: 'docker rm', reason: 'Removing Docker containers' },
	{ pattern: 'DROP TABLE', reason: 'SQL table deletion' },
	{ pattern: 'DROP DATABASE', reason: 'SQL database deletion' },
	{ pattern: 'truncate', reason: 'Truncating data' }
];

export class Auditor {
	private workspaceRoot: string;

	constructor(root: string = process.cwd()) {
		this.workspaceRoot = path.resolve(root);
	}

	setWorkspaceRoot(root: string): void {
		this.workspaceRoot = path.resolve(root);
	}

	async checkCommand(command: string): Promise<AuditResult> {
		const s = await settings.load();
		const lowerCommand = command.toLowerCase();

		// LAYER 1: Use new whitelist-based validator (defense-in-depth)
		const validationResult = await commandValidator.validateCommand(command);
		if (!validationResult.approved && validationResult.isCritical) {
			return {
				approved: false,
				reason: validationResult.reason,
				isCritical: true
			};
		}

		// LAYER 2: Check for blocked string patterns (legacy, kept for defense-in-depth)
		if (BLOCKED_PATTERNS.some((p) => command.includes(p))) {
			return {
				approved: false,
				reason: 'Detected destructive command pattern',
				isCritical: true
			};
		}

		// LAYER 3: Check for blocked regex patterns (e.g., curl URL | sh)
		if (BLOCKED_REGEX_PATTERNS.some((p) => p.test(command))) {
			return {
				approved: false,
				reason: 'Detected dangerous pipe-to-shell pattern',
				isCritical: true
			};
		}

		// LAYER 4: Check settings deny list
		if (await settings.isDenied('bash', command)) {
			return {
				approved: false,
				reason: 'Command blocked by settings',
				isCritical: false
			};
		}

		// LAYER 5: Check mode - in safe mode, everything needs approval UNLESS already session-authorized
		if (s.mode === 'safe') {
			if (await settings.isSessionAuthorized('bash', command)) {
				return {
					approved: true,
					autoApproved: true
				};
			}
			// Otherwise, fall through to prompt (persistent allow list is ignored in safe mode)
		} else {
			if (await settings.isAllowed('bash', command)) {
				return {
					approved: true,
					autoApproved: true
				};
			}
		}

		// LAYER 6: Check for patterns that require approval
		for (const { pattern, reason } of APPROVAL_PATTERNS) {
			if (lowerCommand.includes(pattern.toLowerCase())) {
				// Return approved: false to signal that approval is REQUIRED
				// The tools layer will request user approval before execution
				return {
					approved: false,
					requiresApproval: true,
					reason: reason
				};
			}
		}

		// LAYER 7: If command validator says requires approval (not in whitelist)
		if (!validationResult.approved) {
			return {
				approved: false,
				requiresApproval: true,
				reason: validationResult.reason || 'Command not in approved whitelist'
			};
		}

		return { approved: true };
	}

	/**
	 * Check file path with symlink resolution (prevents path traversal via symlinks)
	 */
	async checkPathAsync(filePath: string): Promise<AuditResult> {
		try {
			// Use command validator's symlink-aware path validation
			const validation = await commandValidator.validatePath(filePath, this.workspaceRoot);
			if (!validation.approved) {
				return validation;
			}

			// Additional checks for hidden files (optional policy)
			const resolved = path.resolve(this.workspaceRoot, filePath);
			const relative = path.relative(this.workspaceRoot, resolved);
			const parts = relative.split(path.sep);

			if (
				parts.some(
					(p) =>
						p.startsWith('.') &&
						p !== '.obsidian' &&
						p !== '.agent' &&
						p !== '.claude' &&
						p !== '.git'
				)
			) {
				// We allow specific dotfiles for internal use
				// Could add stricter policy here if needed
			}

			return { approved: true };
		} catch (error) {
			return {
				approved: false,
				reason: `Invalid path: ${filePath}`,
				isCritical: false
			};
		}
	}

	/**
	 * Synchronous path check (legacy - prefer checkPathAsync)
	 * WARNING: Does not resolve symlinks - use checkPathAsync for security
	 */
	checkPath(filePath: string): AuditResult {
		try {
			const resolved = path.resolve(this.workspaceRoot, filePath);
			const relative = path.relative(this.workspaceRoot, resolved);

			// Path Traversal Check: Must not start with .. and must be inside workspaceRoot
			if (relative.startsWith('..') || path.isAbsolute(relative)) {
				return {
					approved: false,
					reason: `Access denied: Path '${filePath}' is outside the workspace.`,
					isCritical: true
				};
			}

			// Hidden Files Check (optional policy, but usually safe for MVP)
			const parts = relative.split(path.sep);
			if (
				parts.some(
					(p) =>
						p.startsWith('.') &&
						p !== '.obsidian' &&
						p !== '.agent' &&
						p !== '.claude'
				)
			) {
				// We allow .obsidian, .agent, .claude for internal use, but could block others
			}

			return { approved: true };
		} catch (error) {
			return {
				approved: false,
				reason: `Invalid path: ${filePath}`,
				isCritical: false
			};
		}
	}

	async checkFileEdit(filePath: string): Promise<AuditResult> {
		const pathCheck = this.checkPath(filePath);
		if (!pathCheck.approved) return pathCheck;

		try {
			await fs.access(filePath);
			return { approved: true };
		} catch {
			return {
				approved: false,
				reason: `File not found: ${filePath}`,
				isCritical: false
			};
		}
	}
}

export const auditor = new Auditor();
