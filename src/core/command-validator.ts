/**
 * Command Validator - Whitelist-based approach for secure command execution
 *
 * SECURITY: Replaces blacklist patterns with explicit allowlist validation
 */

import fs from 'fs/promises';
import path from 'path';

interface CommandValidation {
	approved: boolean;
	reason?: string;
	sanitizedCommand?: string;
	isCritical?: boolean;
}

// Whitelisted command prefixes (expandable via config)
const SAFE_COMMAND_PREFIXES = [
	// Read operations
	'ls', 'cat', 'head', 'tail', 'grep', 'find', 'file', 'stat',
	// Version control (read-only)
	'git status', 'git log', 'git diff', 'git show', 'git branch',
	// Package managers (read-only)
	'npm list', 'npm ls', 'npm view', 'npm search',
	'yarn list', 'yarn info',
	// Build tools (non-destructive)
	'npm run', 'npm test', 'yarn run', 'yarn test',
	'make build', 'make test',
	// Language tools
	'node', 'python', 'python3', 'ruby', 'go run',
	'cargo build', 'cargo test', 'cargo check',
	// Utilities
	'echo', 'printf', 'date', 'whoami', 'hostname', 'pwd',
	'which', 'whereis', 'type', 'command -v',
	// Linters/formatters
	'eslint', 'prettier', 'tsc', 'rustfmt', 'gofmt'
];

// Commands requiring explicit approval (never auto-approved)
const REQUIRES_APPROVAL = [
	'git push', 'git commit', 'git reset', 'git rebase', 'git merge',
	'npm install', 'npm publish', 'npm uninstall',
	'yarn install', 'yarn add', 'yarn remove',
	'rm', 'rmdir', 'mv', 'cp',
	'docker', 'kubectl', 'terraform',
	'chmod', 'chown', 'chgrp',
	'sudo', 'su',
	'kill', 'killall', 'pkill'
];

// NEVER allowed under any circumstances
const ALWAYS_BLOCKED = [
	'rm -rf /', 'rm -fr /',
	'dd if=', 'mkfs', '> /dev/',
	':(){ :|:& };:', // Fork bomb
	'chmod -R 777', 'chmod 777 /',
	'sudo rm -rf', 'sudo dd'
];

export class CommandValidator {
	/**
	 * Validate command against whitelist-based security model
	 */
	async validateCommand(command: string): Promise<CommandValidation> {
		const trimmed = command.trim();
		const lower = trimmed.toLowerCase();

		// Step 1: Check absolute blocks (NEVER allowed)
		for (const blocked of ALWAYS_BLOCKED) {
			if (lower.includes(blocked.toLowerCase())) {
				return {
					approved: false,
					reason: `CRITICAL: Destructive pattern detected: ${blocked}`,
					isCritical: true
				};
			}
		}

		// Step 2: Check for dangerous pipe-to-shell patterns
		if (this.containsPipeToShell(command)) {
			return {
				approved: false,
				reason: 'CRITICAL: Pipe-to-shell pattern detected (e.g., curl | sh)',
				isCritical: true
			};
		}

		// Step 3: Check for command injection attempts
		if (this.containsInjectionPattern(command)) {
			return {
				approved: false,
				reason: 'CRITICAL: Command injection pattern detected',
				isCritical: true
			};
		}

		// Step 4: Extract base command and validate against whitelist
		const baseCommand = this.extractBaseCommand(command);

		// Check if safe (auto-approved)
		const isSafe = SAFE_COMMAND_PREFIXES.some(prefix =>
			lower.startsWith(prefix.toLowerCase())
		);

		if (isSafe) {
			return {
				approved: true,
				sanitizedCommand: this.sanitizeCommand(command)
			};
		}

		// Check if requires approval
		const requiresApproval = REQUIRES_APPROVAL.some(cmd =>
			lower.startsWith(cmd.toLowerCase())
		);

		if (requiresApproval) {
			return {
				approved: false,
				reason: `Command requires user approval: ${baseCommand}`,
				sanitizedCommand: this.sanitizeCommand(command)
			};
		}

		// Unknown command - deny by default (fail-safe)
		return {
			approved: false,
			reason: `Unknown command not in whitelist: ${baseCommand}. Add to SAFE_COMMAND_PREFIXES if safe.`
		};
	}

	/**
	 * Resolve symlinks to prevent path traversal
	 */
	async resolveSymlinks(filePath: string): Promise<string> {
		try {
			return await fs.realpath(filePath);
		} catch {
			// If realpath fails, return original (validation will fail later)
			return filePath;
		}
	}

	/**
	 * Validate file path is within workspace boundaries
	 */
	async validatePath(filePath: string, workspaceRoot: string): Promise<CommandValidation> {
		try {
			// Resolve symlinks FIRST
			const resolved = await this.resolveSymlinks(filePath);
			const resolvedRoot = await this.resolveSymlinks(workspaceRoot);

			// Check if path is within workspace
			const relative = path.relative(resolvedRoot, resolved);

			if (relative.startsWith('..') || path.isAbsolute(relative)) {
				return {
					approved: false,
					reason: `Path traversal detected: ${filePath} resolves outside workspace`,
					isCritical: true
				};
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

	// ===== PRIVATE HELPERS =====

	private containsPipeToShell(command: string): boolean {
		const patterns = [
			/curl\s+[^\|]+\|\s*(sh|bash|zsh|fish)/i,
			/wget\s+[^\|]+\|\s*(sh|bash|zsh|fish)/i,
			/fetch\s+[^\|]+\|\s*(sh|bash|zsh|fish)/i,
			/;\s*(curl|wget|fetch).*\|\s*(sh|bash)/i
		];
		return patterns.some(p => p.test(command));
	}

	private containsInjectionPattern(command: string): boolean {
		// Detect command substitution attempts
		const injectionPatterns = [
			/`[^`]*rm\s+-rf/i,     // Backtick injection: `rm -rf`
			/\$\([^)]*rm\s+-rf/i,  // $() injection: $(rm -rf)
			/&&\s*rm\s+-rf\s+\//,  // Chain injection: && rm -rf /
			/;\s*rm\s+-rf\s+\//,   // Semicolon injection: ; rm -rf /
			/\|\|\s*rm\s+-rf/i     // Or injection: || rm -rf
		];
		return injectionPatterns.some(p => p.test(command));
	}

	private extractBaseCommand(command: string): string {
		// Extract first word (command name)
		const match = command.trim().match(/^(\S+)/);
		return match ? match[1] : '';
	}

	private sanitizeCommand(command: string): string {
		// Remove potentially dangerous characters while preserving functionality
		// This is a defense-in-depth measure, not primary security
		return command
			.replace(/[`$]/g, '') // Remove backticks and $ for command substitution
			.trim();
	}
}

export const commandValidator = new CommandValidator();
