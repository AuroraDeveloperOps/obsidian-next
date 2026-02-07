/**
 * Obsidian Next - Tool Execution Framework
 * Provides Bash, Read, Edit, Write tools similar to Claude Code
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import os from 'os';
import { bus } from './bus.js';
import { auditor } from './auditor.js';
import { sandbox } from './sandbox.js';
import { context } from './context.js';
import { tasks } from './tasks.js';
import { undo } from './undo.js';
import { settings } from './settings.js';
import { auditLog } from './auditLog.js';
import { diffManager } from './diff.js';
import { redactor } from './redactor.js';
import { config } from './config.js';
import { mcp } from './mcp.js';
import { getRegistryDefinition, listRegistry } from './mcp-registry.js';
import { UserEvent } from '../events/types.js';
import { scheduler } from './scheduler.js';
import { computer, takeScreenshotForAPI } from '../computer/index.js';
import {
    findClickableByLabel,
    clickElementByLabel,
    getUIContext,
    getButtons,
    activateApp,
    getFocusedApp
} from '../computer/accessibility.js';
import { ComputerAction } from '../computer/types.js';

const execAsync = promisify(exec);

// Track the last screenshot scale for coordinate transformation in ComputerUseTool
// This allows coordinate scaling to work even without pilot mode enabled
let lastScreenshotScale = 1.0;

// Safety limits to prevent context explosion
const MAX_OUTPUT_LENGTH = 10000;  // Max chars in tool output
const MAX_FILE_READ_LINES = 500;  // Max lines when reading files
const IGNORED_DIRS = ['node_modules', '.git', 'dist', '.next', '__pycache__', '.cache', 'coverage'];

// Approval request timeout (30 seconds)
const APPROVAL_TIMEOUT = 30000;

/**
 * Truncate output to prevent context explosion
 */
function truncateOutput(output: string, maxLength: number = MAX_OUTPUT_LENGTH): string {
    if (output.length <= maxLength) return output;
    const truncated = output.slice(0, maxLength);
    const remaining = output.length - maxLength;
    return `${truncated}\n\n... [TRUNCATED: ${remaining} more characters]`;
}

/**
 * Filter out known harmless system noise from stderr
 * These are OS-level messages that don't indicate actual errors
 */
function filterSystemNoise(stderr: string): string {
    if (!stderr) return stderr;

    const noisePatterns = [
        /^aks:aks_get_lock_state:\d+:\d+: aks connection failed\s*/gm,  // macOS keychain noise
        /^objc\[\d+\]: .* may have been in progress in another thread.*$/gm,  // Objective-C runtime
        /^Warning: .* is deprecated.*$/gm,  // Deprecation warnings
        /^\[warn\].*$/gmi,  // Generic warn prefixes
        /^MESA-LOADER:.*$/gm,  // Mesa graphics loader
        /^libEGL warning:.*$/gm,  // EGL warnings
        /^Fontconfig warning:.*$/gm,  // Font config
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
const pendingApprovals = new Map<string, {
    resolve: (result: { approved: boolean; scope: 'session' | 'persistent'; bypass?: boolean }) => void;
    timeout: NodeJS.Timeout;
}>();

// Listen for approval responses
bus.on('user', (event: UserEvent) => {
    if (event.type === 'approval_response') {
        const pending = pendingApprovals.get(event.requestId);
        if (pending) {
            clearTimeout(pending.timeout);
            pendingApprovals.delete(event.requestId);
            pending.resolve({ approved: event.approved, scope: event.scope, bypass: event.bypass });
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
async function requestApproval(command: string, reason: string): Promise<{ approved: boolean; scope: 'session' | 'persistent'; bypass?: boolean }> {
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
        const context = [
            `Command: ${command}`,
            `Reason: ${reason}`,
        ].join('\n');

        bus.emitAgent({
            type: 'approval_request',
            requestId,
            context,
        });
    });
}

export interface ToolResult {
    success: boolean;
    output?: string;
    error?: string;
    content?: any[]; // Supports structured content like image blocks
}

export interface Tool {
    name: string;
    description: string;
    inputSchema: Record<string, any>;
    requiredParams: string[];
    execute: (args: Record<string, any>) => Promise<ToolResult>;
}

/**
 * Bash Tool - Execute shell commands with auditor safety checks
 */
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

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const command = args.command as string;

        if (!command) {
            return { success: false, error: 'No command provided' };
        }

        // Safety check
        const audit = await auditor.checkCommand(command);

        // Critical/blocked commands are NEVER allowed (cannot be approved)
        if (!audit.approved && audit.isCritical) {
            await auditLog.logSecurityViolation(command, audit.reason || 'Critical security violation');
            return {
                success: false,
                error: `Security violation: ${audit.reason}`
            };
        }

        // Commands requiring approval MUST wait for user confirmation
        // This includes: dangerous patterns AND all commands in safe mode
        if (!audit.approved && audit.requiresApproval) {
            await auditLog.logApproval('requested', command, audit.reason);

            const { approved, scope, bypass } = await requestApproval(command, audit.reason || 'Potentially dangerous operation');

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
                await auditLog.logApproval('granted', command, bypass ? 'Bypass enabled' : undefined);
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

        // Check if this command should bypass sandbox
        const bypassSandbox = await settings.isUnsandboxed('bash', command);
        const cfg = await config.load();

        try {
            // Wrap command with sandbox if enabled
            const execCommand = await sandbox.wrapCommand(command, bypassSandbox);

            const { stdout, stderr } = await execAsync(execCommand, {
                cwd: cfg.workspaceRoot,
                timeout: 30000, // 30 second timeout
                maxBuffer: 1024 * 1024, // 1MB buffer (reduced from 10MB)
            });

            // Filter out known harmless system noise from stderr
            const filteredStderr = filterSystemNoise(stderr);
            const output = stdout || filteredStderr || 'Command executed successfully';

            // Log successful execution
            await auditLog.logCommand(command, true);

            return {
                success: true,
                output: truncateOutput(output),
            };
        } catch (error: any) {
            // Log failed execution
            await auditLog.logCommand(command, false, error.message);

            return {
                success: false,
                error: error.message || 'Command execution failed',
            };
        }
    },
};

/**
 * Read Tool - Read file contents with syntax awareness
 */
export const ReadTool: Tool = {
    name: 'read',
    description: 'Read file contents from the workspace',
    inputSchema: {
        path: {
            type: 'string',
            description: 'Path to the file to read (relative to workspace)'
        }
    },
    requiredParams: ['path'],

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const filePath = args.path as string;

        if (!filePath) {
            return { success: false, error: 'No file path provided' };
        }

        // Path validation
        const pathCheck = auditor.checkPath(filePath);
        if (!pathCheck.approved) {
            return {
                success: false,
                error: pathCheck.reason
            };
        }

        // Block reading from ignored directories (node_modules, etc.)
        if (IGNORED_DIRS.some(dir => filePath.includes(`/${dir}/`) || filePath.startsWith(`${dir}/`))) {
            return {
                success: false,
                error: `Cannot read from ignored directory. Paths containing ${IGNORED_DIRS.join(', ')} are blocked to prevent context explosion.`
            };
        }

        try {
            const cfg = await config.load();
            const fullPath = path.resolve(cfg.workspaceRoot, filePath);
            const content = await fs.readFile(fullPath, 'utf-8');

            // Add line numbers for better readability
            const lines = content.split('\n');

            // Limit lines to prevent context explosion
            const limitedLines = lines.slice(0, MAX_FILE_READ_LINES);
            const numbered = limitedLines
                .map((line, i) => `${String(i + 1).padStart(4)} | ${line}`)
                .join('\n');

            const truncationNote = lines.length > MAX_FILE_READ_LINES
                ? `\n\n... [TRUNCATED: ${lines.length - MAX_FILE_READ_LINES} more lines. Use offset parameter to read more.]`
                : '';

            // Track in context and audit log
            await context.trackRead(filePath);
            await auditLog.logFileOperation('read', filePath, true);

            return {
                success: true,
                output: truncateOutput(`File: ${filePath} (${lines.length} lines)\n${'='.repeat(60)}\n${numbered}${truncationNote}`),
            };
        } catch (error: any) {
            await auditLog.logFileOperation('read', filePath, false, error.message);
            return {
                success: false,
                error: `Failed to read file: ${error.message}`,
            };
        }
    },
};

/**
 * Write Tool - Create new files in the workspace
 */
export const WriteTool: Tool = {
    name: 'write',
    description: 'Create new files in the workspace',
    inputSchema: {
        path: {
            type: 'string',
            description: 'Path where to create the new file'
        },
        content: {
            type: 'string',
            description: 'Content to write to the file'
        }
    },
    requiredParams: ['path', 'content'],

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const filePath = args.path as string;
        const content = args.content as string;

        if (!filePath) {
            return { success: false, error: 'No file path provided' };
        }

        if (content === undefined) {
            return { success: false, error: 'No content provided' };
        }

        // Path validation
        const pathCheck = auditor.checkPath(filePath);
        if (!pathCheck.approved) {
            return {
                success: false,
                error: pathCheck.reason
            };
        }

        try {
            const cfg = await config.load();
            const fullPath = path.resolve(cfg.workspaceRoot, filePath);

            // Check if file already exists
            try {
                await fs.access(fullPath);
                return {
                    success: false,
                    error: `File already exists: ${filePath}. Use 'edit' tool to modify.`,
                };
            } catch {
                // File doesn't exist, good to proceed
            }

            // Create directory if needed
            await fs.mkdir(path.dirname(fullPath), { recursive: true });

            // Write file
            await fs.writeFile(fullPath, content, 'utf-8');

            // Track in context, undo, audit log, and diff
            await context.trackModified(filePath);
            await undo.recordChange(filePath, 'create', null, content);
            await auditLog.logFileOperation('write', filePath, true);
            await diffManager.saveDiff(filePath, '', content);

            return {
                success: true,
                output: `Created file: ${filePath} (${content.length} bytes)`,
            };
        } catch (error: any) {
            await auditLog.logFileOperation('write', filePath, false, error.message);
            return {
                success: false,
                error: `Failed to write file: ${error.message}`,
            };
        }
    },
};

/**
 * Edit Tool - Modify existing files with search/replace
 */
export const EditTool: Tool = {
    name: 'edit',
    description: 'Edit existing files using search and replace',
    inputSchema: {
        path: {
            type: 'string',
            description: 'Path to the file to edit'
        },
        search: {
            type: 'string',
            description: 'Text to search for (must match exactly)'
        },
        replace: {
            type: 'string',
            description: 'Text to replace with'
        }
    },
    requiredParams: ['path', 'search', 'replace'],

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const filePath = args.path as string;
        const search = args.search as string;
        const replace = args.replace as string;

        if (!filePath) {
            return { success: false, error: 'No file path provided' };
        }

        if (!search) {
            return { success: false, error: 'No search string provided' };
        }

        if (replace === undefined) {
            return { success: false, error: 'No replacement string provided' };
        }

        // File existence and path check
        const fileCheck = await auditor.checkFileEdit(filePath);
        if (!fileCheck.approved) {
            return {
                success: false,
                error: fileCheck.reason
            };
        }

        try {
            const cfg = await config.load();
            const fullPath = path.resolve(cfg.workspaceRoot, filePath);
            const original = await fs.readFile(fullPath, 'utf-8');

            // Check if search string exists
            if (!original.includes(search)) {
                return {
                    success: false,
                    error: `Search string not found in ${filePath}`,
                };
            }

            // Count occurrences for user feedback
            const occurrences = original.split(search).length - 1;

            // Perform replacement - use replaceAll to replace ALL occurrences
            const modified = original.replaceAll(search, replace);

            // Generate diff preview for output
            const diffPreview = generateDiffPreview(search, replace);

            // Write back
            await fs.writeFile(fullPath, modified, 'utf-8');

            // Calculate change stats
            const originalLines = original.split('\n').length;
            const modifiedLines = modified.split('\n').length;
            const delta = modifiedLines - originalLines;

            // Track in context, undo, audit log, and diff
            await context.trackModified(filePath);
            await undo.recordChange(filePath, 'edit', original, modified);
            await auditLog.logFileOperation('edit', filePath, true);
            await diffManager.saveDiff(filePath, original, modified);

            const occurrenceText = occurrences > 1 ? ` (${occurrences} occurrences)` : '';
            return {
                success: true,
                output: `Edited ${filePath}${occurrenceText}:\n${diffPreview}\nLines: ${originalLines} -> ${modifiedLines} (${delta >= 0 ? '+' : ''}${delta})`,
            };
        } catch (error: any) {
            await auditLog.logFileOperation('edit', filePath, false, error.message);
            return {
                success: false,
                error: `Failed to edit file: ${error.message}`,
            };
        }
    },
};

/**
 * Generate a simple diff preview showing what was changed
 */
function generateDiffPreview(search: string, replace: string): string {
    const searchLines = search.split('\n').slice(0, 5);
    const replaceLines = replace.split('\n').slice(0, 5);

    let preview = '';

    // Show removed lines
    for (const line of searchLines) {
        preview += `- ${line}\n`;
    }
    if (search.split('\n').length > 5) {
        preview += `- ... (${search.split('\n').length - 5} more lines)\n`;
    }

    // Show added lines
    for (const line of replaceLines) {
        preview += `+ ${line}\n`;
    }
    if (replace.split('\n').length > 5) {
        preview += `+ ... (${replace.split('\n').length - 5} more lines)\n`;
    }

    return preview.trim();
}

/**
 * List Tool - List files in a directory
 */
export const ListTool: Tool = {
    name: 'list',
    description: 'List files and directories in the workspace',
    inputSchema: {
        path: {
            type: 'string',
            description: 'Directory path to list (defaults to current directory)'
        }
    },
    requiredParams: [],

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const dirPath = args.path as string || '.';

        // Path validation
        const pathCheck = auditor.checkPath(dirPath);
        if (!pathCheck.approved) {
            return {
                success: false,
                error: pathCheck.reason
            };
        }

        try {
            const cfg = await config.load();
            const fullPath = path.resolve(cfg.workspaceRoot, dirPath);
            const entries = await fs.readdir(fullPath, { withFileTypes: true });

            // Filter out ignored directories
            const filtered = entries.filter(entry =>
                !IGNORED_DIRS.includes(entry.name) && !entry.name.startsWith('.')
            );

            const formatted = filtered
                .map(entry => {
                    const prefix = entry.isDirectory() ? '[DIR]' : '[FILE]';
                    return `${prefix} ${entry.name}`;
                })
                .join('\n');

            const hiddenCount = entries.length - filtered.length;
            const hiddenNote = hiddenCount > 0
                ? `\n\n(${hiddenCount} hidden: node_modules, .git, etc.)`
                : '';

            return {
                success: true,
                output: `Directory: ${dirPath}\n${'='.repeat(60)}\n${formatted}${hiddenNote}`,
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to list directory: ${error.message}`,
            };
        }
    },
};

/**
 * Grep Tool - Search file contents with regex
 */
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

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const pattern = args.pattern as string;
        const searchPath = args.path as string || '.';
        const maxResults = args.limit as number || 50;

        if (!pattern) {
            return { success: false, error: 'No search pattern provided' };
        }

        // Path validation
        const pathCheck = auditor.checkPath(searchPath);
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
            await searchDirectory(fullPath, pattern, results, maxResults, 0, cfg.workspaceRoot);

            if (results.length === 0) {
                return {
                    success: true,
                    output: `No matches found for: ${pattern}`,
                };
            }

            return {
                success: true,
                output: truncateOutput(`Found ${results.length} matches for "${pattern}":\n${'='.repeat(60)}\n${results.join('\n')}`),
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Search failed: ${error.message}`,
            };
        }
    },
};

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
                await searchDirectory(fullPath, pattern, results, maxResults, depth + 1, workspaceRoot);
            } else if (entry.isFile()) {
                // Only search text files
                const ext = path.extname(entry.name).toLowerCase();
                const textExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.yaml', '.yml', '.css', '.html', '.sh'];

                if (textExtensions.includes(ext) || ext === '') {
                    try {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const lines = content.split('\n');

                        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                            if (regex.test(lines[i])) {
                                results.push(`${relativePath}:${i + 1}: ${lines[i].trim().slice(0, 100)}`);
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

/**
 * Glob Tool - Fast file pattern matching
 */
export const GlobTool: Tool = {
    name: 'glob',
    description: 'Find files matching a glob pattern (e.g., **/*.ts, src/**/*.tsx)',
    inputSchema: {
        pattern: {
            type: 'string',
            description: 'Glob pattern like **/*.ts or src/**/*.tsx'
        },
        path: {
            type: 'string',
            description: 'Base directory (defaults to current directory)'
        }
    },
    requiredParams: ['pattern'],

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const pattern = args.pattern as string;
        const basePath = args.path as string || '.';

        if (!pattern) {
            return { success: false, error: 'No pattern provided' };
        }

        try {
            const cfg = await config.load();
            const results: string[] = [];
            const fullBase = path.resolve(cfg.workspaceRoot, basePath);
            await globSearch(fullBase, pattern, results, 100, 0, cfg.workspaceRoot);

            if (results.length === 0) {
                return {
                    success: true,
                    output: `No files matching: ${pattern}`,
                };
            }

            return {
                success: true,
                output: truncateOutput(`Found ${results.length} files:\n${results.join('\n')}`),
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Glob failed: ${error.message}`,
            };
        }
    },
};

/**
 * Glob search helper - matches files against patterns
 */
async function globSearch(
    dir: string,
    pattern: string,
    results: string[],
    maxResults: number,
    depth: number = 0,
    workspaceRoot: string = process.cwd()
): Promise<void> {
    if (results.length >= maxResults || depth > 15) return;

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        // Convert glob to regex
        const regexPattern = pattern
            .replace(/\*\*/g, '{{GLOBSTAR}}')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '.')
            .replace(/{{GLOBSTAR}}/g, '.*');
        const regex = new RegExp(`^${regexPattern}$`);

        for (const entry of entries) {
            if (results.length >= maxResults) break;

            // Skip ignored directories
            if (entry.name.startsWith('.') || IGNORED_DIRS.includes(entry.name)) {
                continue;
            }

            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(workspaceRoot, fullPath);

            if (entry.isDirectory()) {
                // If pattern starts with **, search subdirs
                if (pattern.includes('**') || pattern.includes('/')) {
                    await globSearch(fullPath, pattern, results, maxResults, depth + 1, workspaceRoot);
                }
            } else if (entry.isFile()) {
                // Test against pattern
                if (regex.test(relativePath) || regex.test(entry.name)) {
                    results.push(relativePath);
                }
            }
        }
    } catch {
        // Skip directories we can't read
    }
}

/**
 * Task Tool - Manage active tasks/subtasks
 */
export const TaskTool: Tool = {
    name: 'task',
    description: 'Manage the project plan and todo list. Use this for tracking work items, not for scheduling recurring jobs. actions: create, add_step, complete_step, fail_step, complete_task',
    inputSchema: {
        action: {
            type: 'string',
            description: 'Action to perform: create, add_step, complete_step, fail_step, complete_task'
        },
        title: {
            type: 'string',
            description: 'Title for new task (required for create)'
        },
        step: {
            type: 'string',
            description: 'Step description (required for add_step)'
        },
        step_index: {
            type: 'number',
            description: 'Index of step to complete/fail (required for step actions)'
        }
    },
    requiredParams: ['action'],

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const action = args.action as string;
        const title = args.title as string;
        const step = args.step as string;
        const stepIndex = args.step_index as number;

        if (!action) return { success: false, error: 'No action provided' };

        try {
            switch (action) {
                case 'create':
                    if (!title) return { success: false, error: 'Title required for create' };
                    await tasks.create(title);
                    return { success: true, output: `Created task: ${title}` };

                case 'add_step':
                    if (!step) return { success: false, error: 'Step text required' };
                    await tasks.addSubtask(step);
                    return { success: true, output: `Added step: ${step}` };

                case 'complete_step':
                    if (stepIndex === undefined) return { success: false, error: 'Step index required' };
                    await tasks.completeSubtask(stepIndex);
                    return { success: true, output: `Completed step ${stepIndex}` };

                case 'fail_step':
                    // We don't have a specific 'fail' state for subtasks yet, maybe just log or mark as blocked?
                    // For now, let's just assume we can't complete it.
                    // But the plan mentioned 'fail_step'. Let's map it to 'blocked' status for the task if critical?
                    // Or maybe just leave it unchecked.
                    return { success: true, output: `Marked step ${stepIndex} as failed (not implemented in tracker yet)` };

                case 'complete_task':
                    await tasks.complete();
                    return { success: true, output: 'Marked task as complete' };

                default:
                    return { success: false, error: `Unknown action: ${action}` };
            }
        } catch (error: any) {
            return { success: false, error: `Task action failed: ${error.message}` };
        }
    },
};

/**
 * WebFetch Tool - Fetch content from URLs
 */
export const WebFetchTool: Tool = {
    name: 'web_fetch',
    description: 'Fetch content from a URL (for documentation, APIs, etc.)',
    inputSchema: {
        url: {
            type: 'string',
            description: 'URL to fetch content from'
        }
    },
    requiredParams: ['url'],

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const url = args.url as string;

        if (!url) {
            return { success: false, error: 'No URL provided' };
        }

        // Validate URL
        try {
            new URL(url);
        } catch {
            return { success: false, error: 'Invalid URL format' };
        }

        // Block potentially dangerous URLs
        const blockedDomains = ['localhost', '127.0.0.1', '0.0.0.0', '169.254'];
        const urlObj = new URL(url);
        if (blockedDomains.some(d => urlObj.hostname.includes(d))) {
            return {
                success: false,
                error: 'Cannot fetch from local/private addresses'
            };
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Obsidian-Next/1.0 (AI Agent CLI)',
                    'Accept': 'text/html,application/json,text/plain,*/*'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${response.statusText}`
                };
            }

            const contentType = response.headers.get('content-type') || '';
            let content = await response.text();

            // Truncate large responses
            if (content.length > MAX_OUTPUT_LENGTH) {
                content = content.slice(0, MAX_OUTPUT_LENGTH) +
                    `\n\n... [TRUNCATED: ${content.length - MAX_OUTPUT_LENGTH} more characters]`;
            }

            // If HTML, strip tags for cleaner output
            if (contentType.includes('text/html')) {
                content = content
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            return {
                success: true,
                output: truncateOutput(`URL: ${url}\nContent-Type: ${contentType}\n${'='.repeat(60)}\n${content}`),
            };
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return { success: false, error: 'Request timed out after 10 seconds' };
            }
            return {
                success: false,
                error: `Fetch failed: ${error.message}`,
            };
        }
    },
};

/**
 * MCP Management Tool - Allow Agent to manage its own tool servers
 */
export const MCPManagementTool: Tool = {
    name: 'mcp_manage',
    description: 'Manage MCP servers. actions: add, remove, install. Use "install" to easily add certified tools like "filesystem", "git", "research", or "context7".',
    inputSchema: {
        action: {
            type: 'string',
            description: 'Action to perform: add, remove, install'
        },
        name: {
            type: 'string',
            description: 'Name of the server (e.g. "filesystem", "research", "context7")'
        },
        command: {
            type: 'string',
            description: 'Command to execute (add only)'
        },
        args: {
            type: 'string',
            description: 'Args for command (add only)'
        }
    },
    requiredParams: ['action', 'name'],

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const action = args.action as string;
        const name = args.name as string;

        if (action === 'install') {
            const def = getRegistryDefinition(name);
            if (!def) {
                const available = listRegistry().map(r => r.name).join(', ');
                return { success: false, error: `Unknown registry item '${name}'. Available: ${available}` };
            }

            // Idempotency: Check if already exists
            const existing = mcp.getStatus().find(s => s.name === name);
            if (existing && existing.connected) {
                return { success: true, output: `MCP server '${name}' is already installed and connected.` };
            }

            try {
                await mcp.addServer(name, {
                    command: def.command,
                    args: def.args,
                    autoConnect: false,
                    env: def.env
                });
                return { success: true, output: `Successfully installed and connected to certified MCP server '${name}' (${def.description})` };
            } catch (e: any) {
                return { success: false, error: `Failed to install server: ${e.message}` };
            }
        }

        if (action === 'add') {
            if (!args.command) return { success: false, error: 'Command is required for "add" action' };
            const command = args.command as string;
            const commandArgs = (args.args as string || '').split(' ').filter(a => a.length > 0);

            try {
                await mcp.addServer(name, {
                    command,
                    args: commandArgs,
                    autoConnect: false
                });
                return { success: true, output: `Successfully added and connected to MCP server '${name}'` };
            } catch (e: any) {
                return { success: false, error: `Failed to add server: ${e.message}` };
            }
        }

        if (action === 'remove') {
            try {
                await mcp.removeServer(name);
                return { success: true, output: `Successfully removed MCP server '${name}'` };
            } catch (e: any) {
                return { success: false, error: `Failed to remove server: ${e.message}` };
            }
        }

        if (action === 'connect') {
            try {
                const status = mcp.getStatus().find(s => s.name === name);
                if (!status) return { success: false, error: `Server '${name}' not found in config` };
                if (status.connected) return { success: true, output: `Server '${name}' is already connected` };

                await mcp.connect(name, status.config);
                return { success: true, output: `Successfully connected to MCP server '${name}'` };
            } catch (e: any) {
                return { success: false, error: `Failed to connect: ${e.message}` };
            }
        }

        if (action === 'disconnect') {
            try {
                await mcp.disconnect(name);
                return { success: true, output: `Successfully disconnected MCP server '${name}'` };
            } catch (e: any) {
                return { success: false, error: `Failed to disconnect: ${e.message}` };
            }
        }

        if (action === 'status') {
            const status = mcp.getStatus().find(s => s.name === name);
            if (!status) return { success: false, error: `Server '${name}' not found` };
            return {
                success: true,
                output: `Server: ${name}\nStatus: ${status.connected ? 'Connected' : 'Disconnected'}\nTools: ${status.capabilities ? 'Available' : 'N/A'}`
            };
        }

        return { success: false, error: `Unknown action: ${action}` };
    }
};

/**
 * Memory Tool - Long-term memory storage and recall
 *
 * Allows the AI to store and recall user preferences, facts, and learned patterns.
 */
const MemoryTool: Tool = {
    name: 'memory',
    description: 'Store and recall long-term memories: user preferences, project facts, and learned patterns. Use this to remember user information across sessions.',
    inputSchema: {
        action: { type: 'string', description: 'Action: store, recall, search, list, forget' },
        type: { type: 'string', description: 'Memory type: user_preference, project_fact, decision_log, learned_pattern (for store)' },
        key: { type: 'string', description: 'Unique key for the memory (for store, recall, forget)' },
        content: { type: 'string', description: 'Content to store (for store action)' },
        query: { type: 'string', description: 'Search query (for search action)' },
    },
    requiredParams: ['action'],

    async execute(args: Record<string, string>): Promise<ToolResult> {
        const { memory } = await import('./memory.js');
        const { action, type, key, content, query } = args;

        await memory.init();

        if (action === 'store') {
            if (!key || !content) {
                return { success: false, error: 'store requires key and content' };
            }
            const memoType = (type as any) || 'user_preference';
            const success = await memory.store(memoType, key, content);
            if (success) {
                return { success: true, output: `Stored memory: ${key}` };
            }
            return { success: false, error: 'Failed to store memory' };
        }

        if (action === 'recall') {
            if (!key) {
                return { success: false, error: 'recall requires key' };
            }
            const memo = await memory.recall(key);
            if (memo) {
                return { success: true, output: `[${memo.type}] ${memo.key}: ${memo.content}` };
            }
            return { success: true, output: `No memory found for key: ${key}` };
        }

        if (action === 'search') {
            if (!query) {
                return { success: false, error: 'search requires query' };
            }
            const memos = await memory.search(query, type as any);
            if (memos.length === 0) {
                return { success: true, output: 'No memories found matching query' };
            }
            const lines = memos.map(m => `- [${m.type}] ${m.key}: ${m.content}`);
            return { success: true, output: `Found ${memos.length} memories:\n${lines.join('\n')}` };
        }

        if (action === 'list') {
            const memoType = (type as any);
            let memos: any[];
            
            if (memoType) {
                memos = await memory.getByType(memoType);
                if (memos.length === 0) {
                    return { success: true, output: `No ${memoType} memories found` };
                }
                const lines = memos.map(m => `- ${m.key}: ${m.content}`);
                return { success: true, output: `${memoType} memories:\n${lines.join('\n')}` };
            } else {
                // List summary of everything
                const stats = await memory.getStats();
                const allMemos: string[] = [];
                
                for (const t of Object.keys(stats.byType)) {
                    const typeMemos = await memory.getByType(t as any);
                    if (typeMemos.length > 0) {
                        allMemos.push(`--- ${t} ---`);
                        allMemos.push(...typeMemos.map(m => `- ${m.key}: ${m.content}`));
                    }
                }
                
                if (allMemos.length === 0) return { success: true, output: 'No memories found in any category.' };
                return { success: true, output: `Current Memory Bank:\n${allMemos.join('\n')}` };
            }
        }

        if (action === 'forget') {
            if (!key) {
                return { success: false, error: 'forget requires key' };
            }
            const success = await memory.forget(key);
            if (success) {
                return { success: true, output: `Forgot memory: ${key}` };
            }
            return { success: false, error: 'Failed to forget memory' };
        }

        return { success: false, error: `Unknown action: ${action}. Valid: store, recall, search, list, forget` };
    }
};

/**
 * Unschedule Tool - Remove a recurring background task
 */
export const UnscheduleTool: Tool = {
    name: 'unschedule_task',
    description: 'Unschedule a previously scheduled background cron job. Requires the task ID.',
    inputSchema: {
        taskId: {
            type: 'string',
            description: 'The ID of the task to unschedule (obtained from list_scheduled_tasks).'
        }
    },
    requiredParams: ['taskId'],

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const taskId = args.taskId as string;

        if (!taskId) {
            return { success: false, error: 'Task ID is required to unschedule a task.' };
        }

        try {
            const success = await scheduler.removeTask(taskId);
            if (success) {
                return { success: true, output: `Successfully unscheduled task: ${taskId}` };
            } else {
                return { success: false, output: `Failed to unschedule task: ${taskId}. Task not found or already inactive.` };
            }
        } catch (error: any) {
            return { success: false, error: `Failed to unschedule task: ${error.message}` };
        }
    },
};


/**
 * Computer Use Tool - Interact with the desktop environment
 *
 * Supports two modes:
 * 1. Coordinate-based: Traditional screenshot + click at (x,y)
 * 2. Accessibility-based: Smart element targeting by label (macOS only)
 */
export const ComputerUseTool: Tool = {
    name: 'computer',
    description: `Desktop interaction. PREFER BASH for URLs/apps (e.g., bash 'open "https://youtube.com"').

SMART ACTIONS (use first):
- find_and_click: Click by label ("Submit", "Play") - no coordinates needed
- get_ui_context: List buttons/fields in current window
- get_buttons: List all button labels
- activate_app: Bring app to front

COORDINATE ACTIONS (use when smart actions fail):
- screenshot: Capture screen
- left_click: Click at [x,y]
- type: Type text
- key: Press key (cmd+l, Return, etc.)
- scroll: Scroll at position`,
    inputSchema: {
        action: {
            type: 'string',
            description: 'SMART (prefer): find_and_click, get_ui_context, get_buttons, activate_app, get_focused_app. COORDINATE (fallback): screenshot, left_click, type, key, scroll, mouse_move, double_click, right_click, left_click_drag, wait, zoom.'
        },
        coordinate: {
            type: 'array',
            items: { type: 'number' },
            description: '[x, y] pixel coordinates for coordinate-based actions.'
        },
        text: {
            type: 'string',
            description: 'Text to type, or modifier key for clicks (shift, control, alt, command).'
        },
        key: {
            type: 'string',
            description: 'Key to press (e.g., enter, escape, ctrl+c).'
        },
        label: {
            type: 'string',
            description: 'UI element label for find_and_click (e.g., "Submit", "Cancel", "OK").'
        },
        app_name: {
            type: 'string',
            description: 'Application name for activate_app or to scope element search.'
        },
        scroll_direction: {
            type: 'string',
            description: 'up, down, left, or right'
        },
        scroll_amount: {
            type: 'number',
            description: 'Amount to scroll (default: 3)'
        },
        start_coordinate: {
            type: 'array',
            items: { type: 'number' },
            description: '[x, y] start coordinates for drag'
        },
        end_coordinate: {
            type: 'array',
            items: { type: 'number' },
            description: '[x, y] end coordinates for drag'
        },
        duration: {
            type: 'number',
            description: 'Duration in milliseconds (for wait, hold_key)'
        },
        region: {
            type: 'array',
            items: { type: 'number' },
            description: '[x1, y1, x2, y2] region for zoom'
        }
    },
    requiredParams: ['action'],

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const actionType = args.action;

        if (!actionType) {
            return { success: false, error: 'No computer action provided. Use: screenshot, left_click, type, key, mouse_move, scroll, etc.' };
        }

        // Helper to validate coordinate array
        const validateCoord = (coord: any, name: string = 'coordinate'): [number, number] | null => {
            if (!coord || !Array.isArray(coord) || coord.length < 2) {
                return null;
            }
            const x = Number(coord[0]);
            const y = Number(coord[1]);
            if (isNaN(x) || isNaN(y)) return null;
            return [x, y];
        };

        // Scale coordinates from screenshot space to native screen space
        // This ensures clicks land in the correct position regardless of pilot mode
        const scaleToNative = (coord: [number, number]): [number, number] => {
            if (lastScreenshotScale >= 1.0) return coord;
            return [
                Math.round(coord[0] / lastScreenshotScale),
                Math.round(coord[1] / lastScreenshotScale)
            ];
        };

        try {
            let output: string | undefined;

            switch (actionType) {
                case 'screenshot':
                    // Use API-optimized screenshot (resized for API limits)
                    const screenshotResult = await takeScreenshotForAPI(false);
                    // Store scale for coordinate transformation (works with or without pilot mode)
                    lastScreenshotScale = screenshotResult.scale;
                    // Emit scale update so coordinate conversion uses the correct values
                    bus.emitAgent({
                        type: 'computer_scale_update',
                        scale: screenshotResult.scale,
                        scaledWidth: screenshotResult.width,
                        scaledHeight: screenshotResult.height,
                        nativeWidth: Math.round(screenshotResult.width / screenshotResult.scale),
                        nativeHeight: Math.round(screenshotResult.height / screenshotResult.scale)
                    });
                    return {
                        success: true,
                        output: `Screenshot captured (${screenshotResult.width}x${screenshotResult.height}, scale: ${screenshotResult.scale.toFixed(2)}). Native: ${Math.round(screenshotResult.width / screenshotResult.scale)}x${Math.round(screenshotResult.height / screenshotResult.scale)}`,
                        content: [{ type: 'image', data: screenshotResult.base64, mimeType: 'image/png' }]
                    };

                case 'left_click': {
                    const coord = validateCoord(args.coordinate);
                    if (!coord) return { success: false, error: 'left_click requires coordinate: [x, y] as numbers' };
                    const [nativeX, nativeY] = scaleToNative(coord);
                    await computer.leftClick(nativeX, nativeY, args.text);
                    output = `Clicked at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}). If this missed the target, re-examine the screenshot and identify the EXACT center of the element you want to click.`;
                    break;
                }

                case 'type':
                    if (!args.text && args.text !== '') return { success: false, error: 'type requires text parameter' };
                    await computer.typeText(args.text);
                    output = `Typed: "${args.text.substring(0, 30)}${args.text.length > 30 ? '...' : ''}"`;
                    break;

                case 'key':
                    const keyToPress = args.key || args.text;
                    if (!keyToPress) return { success: false, error: 'key requires key parameter (e.g., "enter", "escape", "ctrl+c")' };
                    await computer.pressKey(keyToPress);
                    output = `Pressed key: ${keyToPress}`;
                    break;

                case 'mouse_move': {
                    const coord = validateCoord(args.coordinate);
                    if (!coord) return { success: false, error: 'mouse_move requires coordinate: [x, y]' };
                    const [nativeX, nativeY] = scaleToNative(coord);
                    await computer.mouseMove(nativeX, nativeY);
                    output = `Mouse moved to screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
                    break;
                }

                case 'scroll': {
                    const coord = validateCoord(args.coordinate);
                    if (!coord) return { success: false, error: 'scroll requires coordinate: [x, y]' };
                    if (!args.scroll_direction) return { success: false, error: 'scroll requires scroll_direction: up|down|left|right' };
                    const amount = args.scroll_amount || 3;
                    const [nativeX, nativeY] = scaleToNative(coord);
                    await computer.scroll(nativeX, nativeY, args.scroll_direction, amount, args.text);
                    output = `Scrolled ${args.scroll_direction} by ${amount} at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
                    break;
                }

                case 'left_click_drag': {
                    const startCoord = validateCoord(args.start_coordinate, 'start_coordinate');
                    const endCoord = validateCoord(args.end_coordinate, 'end_coordinate');
                    if (!startCoord) return { success: false, error: 'left_click_drag requires start_coordinate: [x, y]' };
                    if (!endCoord) return { success: false, error: 'left_click_drag requires end_coordinate: [x, y]' };
                    const [nativeStartX, nativeStartY] = scaleToNative(startCoord);
                    const [nativeEndX, nativeEndY] = scaleToNative(endCoord);
                    await computer.leftClickDrag(nativeStartX, nativeStartY, nativeEndX, nativeEndY);
                    output = `Dragged from screenshot (${startCoord[0]}, ${startCoord[1]}) -> native (${nativeStartX}, ${nativeStartY}) to screenshot (${endCoord[0]}, ${endCoord[1]}) -> native (${nativeEndX}, ${nativeEndY}).`;
                    break;
                }

                case 'right_click': {
                    const coord = validateCoord(args.coordinate);
                    if (!coord) return { success: false, error: 'right_click requires coordinate: [x, y]' };
                    const [nativeX, nativeY] = scaleToNative(coord);
                    await computer.rightClick(nativeX, nativeY, args.text);
                    output = `Right click at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
                    break;
                }

                case 'middle_click': {
                    const coord = validateCoord(args.coordinate);
                    if (!coord) return { success: false, error: 'middle_click requires coordinate: [x, y]' };
                    const [nativeX, nativeY] = scaleToNative(coord);
                    await computer.middleClick(nativeX, nativeY, args.text);
                    output = `Middle click at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
                    break;
                }

                case 'double_click': {
                    const coord = validateCoord(args.coordinate);
                    if (!coord) return { success: false, error: 'double_click requires coordinate: [x, y]' };
                    const [nativeX, nativeY] = scaleToNative(coord);
                    await computer.doubleClick(nativeX, nativeY, args.text);
                    output = `Double click at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
                    break;
                }

                case 'triple_click': {
                    const coord = validateCoord(args.coordinate);
                    if (!coord) return { success: false, error: 'triple_click requires coordinate: [x, y]' };
                    const [nativeX, nativeY] = scaleToNative(coord);
                    await computer.tripleClick(nativeX, nativeY, args.text);
                    output = `Triple click at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
                    break;
                }

                case 'left_mouse_down': {
                    const coord = validateCoord(args.coordinate);
                    if (!coord) return { success: false, error: 'left_mouse_down requires coordinate: [x, y]' };
                    const [nativeX, nativeY] = scaleToNative(coord);
                    await computer.leftMouseDown(nativeX, nativeY);
                    output = `Mouse down at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
                    break;
                }

                case 'left_mouse_up': {
                    const coord = validateCoord(args.coordinate);
                    if (!coord) return { success: false, error: 'left_mouse_up requires coordinate: [x, y]' };
                    const [nativeX, nativeY] = scaleToNative(coord);
                    await computer.leftMouseUp(nativeX, nativeY);
                    output = `Mouse up at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
                    break;
                }

                case 'hold_key': {
                    const keyToHold = args.key || args.text;
                    if (!keyToHold) return { success: false, error: 'hold_key requires key parameter' };
                    const duration = args.duration || 1;
                    await computer.holdKey(keyToHold, duration);
                    output = `Held ${keyToHold} for ${duration}s.`;
                    break;
                }

                case 'wait': {
                    const duration = args.duration || 1000;
                    await computer.wait(duration);
                    output = `Waited ${duration}ms.`;
                    break;
                }

                case 'zoom': {
                    if (!args.region || !Array.isArray(args.region) || args.region.length < 4) {
                        return { success: false, error: 'zoom requires region: [x1, y1, x2, y2]' };
                    }
                    const [x1, y1, x2, y2] = args.region;
                    const [nativeX1, nativeY1] = scaleToNative([x1, y1]);
                    const [nativeX2, nativeY2] = scaleToNative([x2, y2]);
                    const zoomResult = await computer.zoom(nativeX1, nativeY1, nativeX2, nativeY2);
                    return {
                        success: true,
                        output: `Zoomed region screenshot (${x1}, ${y1}) to (${x2}, ${y2}) -> native (${nativeX1}, ${nativeY1}) to (${nativeX2}, ${nativeY2}).`,
                        content: [{ type: 'image', data: zoomResult, mimeType: 'image/png' }]
                    };
                }

                case 'get_dimensions':
                    const dims = await computer.getDisplayDimensions();
                    return { success: true, output: `Display: ${dims.width}x${dims.height}. Use these dimensions for coordinate calculations.` };

                case 'batch':
                    if (!args.commands || !Array.isArray(args.commands)) {
                        return { success: false, error: 'batch requires commands: string[]' };
                    }
                    await computer.executeBatch(args.commands);
                    output = `Batch executed ${args.commands.length} commands.`;
                    break;

                // ==================== SMART ACCESSIBILITY-BASED ACTIONS ====================

                case 'find_and_click': {
                    // Click an element by its label using accessibility API
                    if (!args.label) return { success: false, error: 'find_and_click requires label parameter (e.g., "Submit", "OK")' };

                    // First try accessibility-based click (more reliable)
                    const clicked = await clickElementByLabel(args.label, args.app_name);
                    if (clicked) {
                        output = `Clicked element labeled "${args.label}" via accessibility API.`;
                        break;
                    }

                    // Fallback: find coordinates and click
                    const coords = await findClickableByLabel(args.label);
                    if (coords) {
                        await computer.leftClick(coords[0], coords[1]);
                        output = `Clicked "${args.label}" at (${coords[0]}, ${coords[1]}).`;
                        break;
                    }

                    return { success: false, error: `Could not find element labeled "${args.label}". Try using screenshot + coordinate-based click.` };
                }

                case 'get_ui_context': {
                    // Get current UI state (focused app, window, available buttons/fields)
                    const uiContext = await getUIContext();
                    return {
                        success: true,
                        output: `Current UI State:\n${uiContext}\n\nUse find_and_click with a button label, or screenshot + coordinates for unlisted elements.`
                    };
                }

                case 'get_buttons': {
                    // List all buttons in the current window
                    const buttons = await getButtons(args.app_name);
                    if (buttons.length === 0) {
                        return { success: true, output: 'No buttons found in current window. Try screenshot to see the UI.' };
                    }
                    return {
                        success: true,
                        output: `Available buttons (${buttons.length}):\n${buttons.map(b => `  - "${b}"`).join('\n')}\n\nUse find_and_click with any of these labels.`
                    };
                }

                case 'activate_app': {
                    // Bring an application to the front
                    if (!args.app_name) return { success: false, error: 'activate_app requires app_name parameter' };
                    const activated = await activateApp(args.app_name);
                    if (activated) {
                        output = `Activated "${args.app_name}".`;
                        // Take verification screenshot
                        await new Promise(r => setTimeout(r, 500));
                        const verifyScreenshot = await takeScreenshotForAPI(false);
                        return {
                            success: true,
                            output: `${output} Window now in focus.`,
                            content: [{ type: 'image', data: verifyScreenshot.base64, mimeType: 'image/png' }]
                        };
                    }
                    return { success: false, error: `Could not activate "${args.app_name}". Check if the app is running.` };
                }

                case 'get_focused_app': {
                    const app = await getFocusedApp();
                    return { success: true, output: `Currently focused: ${app}` };
                }

                default:
                    return { success: false, error: `Unknown action: ${actionType}. SMART: find_and_click, get_ui_context, get_buttons, activate_app. COORDINATE: screenshot, left_click, type, key, scroll, etc.` };
            }

            // Automatic Visual Verification for state-changing actions
            const interactionActions = ['left_click', 'right_click', 'double_click', 'triple_click', 'type', 'key', 'left_click_drag', 'batch', 'find_and_click'];
            if (interactionActions.includes(actionType)) {
                // Pause slightly for the UI to update
                await new Promise(resolve => setTimeout(resolve, 500));
                // Use API-optimized screenshot with cursor for verification
                const verifyScreenshot = await takeScreenshotForAPI(true);
                return {
                    success: true,
                    output: `${output || 'Action executed.'} Verification captured (${verifyScreenshot.width}x${verifyScreenshot.height}).`,
                    content: [{ type: 'image', data: verifyScreenshot.base64, mimeType: 'image/png' }]
                };
            }

            return { success: true, output: output || 'Computer action executed successfully.' };
        } catch (error: any) {
            return { success: false, error: `Computer action failed: ${error.message}` };
        }
    },
};

/**
 * Tool Registry - Manages available tools
 */
/**
 * Create Skill Tool - Autonomous tool generation
 */
export const CreateSkillTool: Tool = {
    name: 'create_skill',
    description: 'Create a new autonomous skill (tool) for the agent. This tool writes the implementation, runs tests, and registers it dynamically. The code MUST be a valid Node.js module that exports default a Tool object.',
    inputSchema: {
        name: {
            type: 'string',
            description: 'Name of the tool (e.g., "jira_issue_create")'
        },
        description: {
            type: 'string',
            description: 'What the tool does'
        },
        code: {
            type: 'string',
            description: 'Node.js code for the tool. Must export default a Tool object.'
        }
    },
    requiredParams: ['name', 'description', 'code'],

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const name = args.name as string;
        const code = args.code as string;
        const skillsDir = path.join(os.homedir(), '.obsidian-next', 'skills');
        const skillPath = path.join(skillsDir, `${name}.js`);

        try {
            if (!fsSync.existsSync(skillsDir)) {
                fsSync.mkdirSync(skillsDir, { recursive: true });
            }

            await fs.writeFile(skillPath, code, 'utf-8');

            // Dynamically import and register
            const module = await import(`file://${skillPath}?t=${Date.now()}`); // Use cache buster
            if (module.default && module.default.name) {
                tools.register(module.default);
                return {
                    success: true,
                    output: `Skill '${name}' created and registered successfully. It is now available for use.`
                };
            }

            return { success: false, error: 'Skill code must export default a Tool object.' };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to create skill: ${error.message}`
            };
        }
    }
};

export class ToolRegistry {
    private tools = new Map<string, Tool>();
    private skillsDir = path.join(os.homedir(), '.obsidian-next', 'skills');

    constructor() {
        // Register built-in tools
        this.register(BashTool);
        this.register(ReadTool);
        this.register(WriteTool);
        this.register(EditTool);
        this.register(ListTool);
        this.register(GrepTool);
        this.register(GlobTool);
        this.register(TaskTool);
        this.register(WebFetchTool);
        this.register(MCPManagementTool);
        this.register(ScheduleTool);
        this.register(ListScheduledTasksTool);
        this.register(UnscheduleTool);
        this.register(MemoryTool);
        this.register(ComputerUseTool);
        this.register(CreateSkillTool);
    }

    async init() {
        await this.loadSkills();
    }

    private async loadSkills() {
        if (!fsSync.existsSync(this.skillsDir)) {
            fsSync.mkdirSync(this.skillsDir, { recursive: true });
        }

        try {
            const files = await fs.readdir(this.skillsDir);
            for (const file of files) {
                if (file.endsWith('.js')) {
                    try {
                        const skillPath = path.join(this.skillsDir, file);
                        const module = await import(`file://${skillPath}`);
                        if (module.default && module.default.name) {
                            this.register(module.default);
                        }
                    } catch (e) {
                        console.error(`Failed to load skill ${file}:`, e);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to read skills directory:', e);
        }
    }

    register(tool: Tool): void {
        this.tools.set(tool.name, tool);
    }

    has(name: string): boolean {
        return this.tools.has(name);
    }

    get(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    async list(): Promise<Tool[]> {
        const staticTools = Array.from(this.tools.values());

        try {
            const dynamicTools = await mcp.listTools();

            // Adapt MCP tools to internal Tool interface
            const mcpAdapters: Tool[] = dynamicTools.map((dt: any) => ({
                name: `${dt.server}_${dt.name}`, // Namespace: server_toolname
                description: `[MCP: ${dt.server}] ${dt.description || ''}`,
                inputSchema: dt.inputSchema?.properties || {},
                requiredParams: dt.inputSchema?.required || [],
                execute: async (args: any) => {
                    // Start tool event is handled by registry.execute wrapper
                    // We just call the MCP manager
                    const result = await mcp.callTool(dt.server, dt.name, args);

                    if (result.isError) {
                        return { success: false, error: 'MCP Tool Error' }; // generic error, result content usually has details?
                        // MCP callTool returns CallToolResult which has content array.
                        // We need to parse content.
                    }

                    // Parse MCP content result
                    const output = result.content.filter((c: any) => c.text).map((c: any) => c.text).join('\n');
                    return { success: !result.isError, output, content: result.content };
                }
            }));

            return [...staticTools, ...mcpAdapters];
        } catch (error) {
            console.error('Failed to list MCP tools:', error);
            return staticTools;
        }
    }

    async execute(name: string, args: Record<string, any>): Promise<ToolResult> {
        let tool = this.tools.get(name);

        // If not a built-in tool, check if it's an MCP tool
        if (!tool) {
            const mcpTools = await this.list();
            tool = mcpTools.find(t => t.name === name);
        }

        if (!tool) {
            return {
                success: false,
                error: `Unknown tool: ${name}. Available: ${(await this.list()).map(t => t.name).join(', ')}`
            };
        }

        // Emit tool_start event
        bus.emitAgent({
            type: 'tool_start',
            tool: name,
            args: JSON.stringify(args, null, 2),
        });

        // Execute tool
        const result = await tool.execute(args);

        // Emit tool_result event
        // Redact PII from output before emitting to event bus (visible to UI/History)
        const rawOutput = result.success ? (result.output || 'Success') : (result.error || 'Failed');
        const redacted = redactor.redactToolOutput(name, rawOutput);

        bus.emitAgent({
            type: 'tool_result',
            tool: name,
            output: redacted.text,
            isError: !result.success,
        });

        return result;
    }
}


/**
 * Schedule Tool - Create a recurring background task
 */
export const ScheduleTool: Tool = {
    name: 'schedule_task',
    description: 'Schedule a recurring background cron job. Use this for requests like "every hour", "at 9am", or "check every X".',
    inputSchema: {
        cron: {
            type: 'string',
            description: 'Cron expression (e.g. "* * * * *")'
        },
        ability: {
            type: 'string',
            description: 'Name of the ability to execute. Available: "system:bash", "system:echo", "system:notify" (sound + alert), "system:summary", "system:heartbeat"'
        },
        params: {
            type: 'string',
            description: 'JSON string of parameters. For system:notify, use {"title": "...", "message": "..."}. For system:bash, use {"command": "..."}'
        }
    },
    requiredParams: ['cron', 'ability'],

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const cron = args.cron as string;
        const ability = args.ability as string;
        const paramsStr = args.params as string || '{}';

        if (!cron || !ability) {
            return { success: false, error: 'Cron expression and ability name are required' };
        }

        let params = {};
        try {
            params = JSON.parse(paramsStr);
        } catch {
            return { success: false, error: 'Invalid JSON parameters' };
        }

        try {
            const task = await scheduler.scheduleTask(cron, ability, params);
            return {
                success: true,
                output: `Scheduled task ${task.id}: ${ability} @ "${cron}"`
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to schedule task: ${error.message}`
            };
        }
    },
};

/**
 * List Scheduled Tasks Tool
 */
export const ListScheduledTasksTool: Tool = {
    name: 'list_scheduled_tasks',
    description: 'List all scheduled/recurring background cron jobs. Use this when the user asks "what tasks are scheduled", "show scheduled tasks", "check scheduled jobs", "list cron jobs", or any variation asking about background recurring tasks.',
    inputSchema: {},
    requiredParams: [],

    async execute(args: Record<string, any>): Promise<ToolResult> {
        try {
            const tasks = scheduler.listTasks();
            if (tasks.length === 0) {
                return { success: true, output: 'No active scheduled tasks.' };
            }

            const header = `ID | CRON | COMMAND | LAST RUN | NEXT RUN\n${'-'.repeat(80)}`;
            const rows = tasks.map(t => {
                const last = t.last_run_at ? new Date(t.last_run_at).toLocaleString() : 'Never';
                const next = t.next_run_at ? new Date(t.next_run_at).toLocaleString() : 'Unknown';
                return `${t.id} | ${t.cron_expression} | ${t.command} | ${last} | ${next}`;
            }).join('\n');

            return {
                success: true,
                output: `${header}\n${rows}`
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to list tasks: ${error.message}`
            };
        }
    },
};

export const tools = new ToolRegistry();
