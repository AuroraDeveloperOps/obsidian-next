/**
 * Bash Tool - Execute shell commands with auditor safety checks
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { auditor } from '../../core/auditor.js';
import { sandbox } from '../../core/sandbox.js';
import { config } from '../../core/config.js';
import { settings } from '../../core/settings.js';
import { cachedSettings } from '../../core/settings-cache.js';
import { auditLog } from '../../core/auditLog.js';
import {
	Tool,
	ToolResult,
	truncateOutput,
	filterSystemNoise,
	requestApproval
} from '../shared.js';

const execAsync = promisify(exec);

export const BashTool: Tool = {
	name: 'bash',
	description: 'Execute shell commands in the workspace',
	inputSchema: {
		command: {
			type: 'string',
			description: 'The shell command to execute'
		}
	},
	requiredParams: ['command'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const command = args.command as string;

		if (!command) {
			return { success: false, error: 'No command provided' };
		}

		// Safety check
		const audit = await auditor.checkCommand(command);

		// Critical/blocked commands are NEVER allowed (cannot be approved)
		if (!audit.approved && audit.isCritical) {
			await auditLog.logSecurityViolation(
				command,
				audit.reason || 'Critical security violation'
			);
			return {
				success: false,
				error: `Security violation: ${audit.reason}`
			};
		}

		// Commands requiring approval MUST wait for user confirmation
		// This includes: dangerous patterns AND all commands in safe mode
		if (!audit.approved && audit.requiresApproval) {
			await auditLog.logApproval('requested', command, audit.reason);

			const { approved, scope, bypass } = await requestApproval(
				command,
				audit.reason || 'Potentially dangerous operation'
			);

			if (approved) {
				if (scope === 'persistent') {
					if (bypass) {
						await settings.addUnsandboxedPermission('bash', command);
					} else {
						await settings.addAllowedPermission('bash', command);
					}
				} else {
					await settings.addSessionPermission('bash', command, true, bypass);
				}
				await auditLog.logApproval(
					'granted',
					command,
					bypass ? 'Bypass enabled' : undefined
				);
			} else {
				if (scope === 'persistent') {
					await settings.addDeniedPermission('bash', command);
				} else {
					await settings.addSessionPermission('bash', command, false);
				}
				await auditLog.logApproval('denied', command);
				return {
					success: false,
					error: 'Command rejected by user'
				};
			}
		}

		// Check if this command should bypass sandbox (cached)
		const bypassSandbox = await cachedSettings(
			`settings:unsandboxed:bash:${command}`,
			() => settings.isUnsandboxed('bash', command),
			5000 // 5 second TTL
		);

		// Load config (cached separately)
		const cfg = await cachedSettings(
			'config:workspace',
			() => config.load(),
			10000 // 10 second TTL for config
		);

		try {
			// Wrap command with sandbox if enabled
			const execCommand = await sandbox.wrapCommand(command, bypassSandbox);

			const { stdout, stderr } = await execAsync(execCommand, {
				cwd: cfg.workspaceRoot,
				timeout: 30000, // 30 second timeout
				maxBuffer: 1024 * 1024 // 1MB buffer (reduced from 10MB)
			});

			// Filter out known harmless system noise from stderr
			const filteredStderr = filterSystemNoise(stderr);
			const output =
				stdout || filteredStderr || 'Command executed successfully';

			// Log successful execution
			await auditLog.logCommand(command, true);

			return {
				success: true,
				output: truncateOutput(output)
			};
		} catch (error: unknown) {
			// Log failed execution
			const msg =
				error instanceof Error ? error.message : 'Command execution failed';
			await auditLog.logCommand(command, false, msg);

			return {
				success: false,
				error: msg
			};
		}
	}
};
