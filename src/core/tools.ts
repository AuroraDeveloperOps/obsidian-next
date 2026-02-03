/**
 * Obsidian Next - Tool Execution Framework
 * Provides Bash, Read, Edit, Write tools similar to Claude Code
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
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
import { mcp } from './mcp.js';
import { getRegistryDefinition, listRegistry } from './mcp-registry.js';
import { UserEvent } from '../events/types.js';
import { scheduler } from './scheduler.js';
import { computer } from '../computer/index.js';
import { ComputerAction } from '../computer/types.js';

const execAsync = promisify(exec);

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

        try {
            // Wrap command with sandbox if enabled
            const execCommand = await sandbox.wrapCommand(command, bypassSandbox);

            const { stdout, stderr } = await execAsync(execCommand, {
                cwd: process.cwd(),
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
            const fullPath = path.resolve(process.cwd(), filePath);
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
            const fullPath = path.resolve(process.cwd(), filePath);

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
            const fullPath = path.resolve(process.cwd(), filePath);
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
            const fullPath = path.resolve(process.cwd(), dirPath);
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
            const fullPath = path.resolve(process.cwd(), searchPath);
            const results: string[] = [];

            // Use recursive search
            await searchDirectory(fullPath, pattern, results, maxResults);

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
    depth: number = 0
): Promise<void> {
    if (results.length >= maxResults || depth > 10) return;

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const regex = new RegExp(pattern, 'gi');

        for (const entry of entries) {
            if (results.length >= maxResults) break;

            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(process.cwd(), fullPath);

            // Skip ignored directories (node_modules, .git, etc.)
            if (entry.name.startsWith('.') || IGNORED_DIRS.includes(entry.name)) {
                continue;
            }

            if (entry.isDirectory()) {
                await searchDirectory(fullPath, pattern, results, maxResults, depth + 1);
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
            const results: string[] = [];
            const fullBase = path.resolve(process.cwd(), basePath);

            await globSearch(fullBase, pattern, results, 100);

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
    depth: number = 0
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
            const relativePath = path.relative(process.cwd(), fullPath);

            if (entry.isDirectory()) {
                // If pattern starts with **, search subdirs
                if (pattern.includes('**') || pattern.includes('/')) {
                    await globSearch(fullPath, pattern, results, maxResults, depth + 1);
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
            const memoType = (type as any) || 'user_preference';
            const memos = await memory.getByType(memoType);
            if (memos.length === 0) {
                return { success: true, output: `No ${memoType} memories found` };
            }
            const lines = memos.map(m => `- ${m.key}: ${m.content}`);
            return { success: true, output: `${memoType} memories:\n${lines.join('\n')}` };
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
 */
export const ComputerUseTool: Tool = {
    name: 'computer',
    description: 'Interact with the desktop environment (screenshots, mouse, keyboard)',
    inputSchema: {
        action: {
            type: 'string',
            description: 'The action to perform: screenshot, mouse_move, left_click, left_click_drag, right_click, middle_click, double_click, key, type, scroll, left_mouse_down, left_mouse_up, wait, zoom'
        },
        coordinate: {
            type: 'array',
            items: { type: 'number' },
            description: '[x, y] coordinates'
        },
        text: {
            type: 'string',
            description: 'Text to type or key modifier'
        },
        key: {
            type: 'string',
            description: 'Key to press'
        },
        scroll_direction: {
            type: 'string',
            description: 'up, down, left, or right'
        },
        scroll_amount: {
            type: 'number',
            description: 'Amount to scroll'
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
            description: 'Duration in milliseconds'
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
            return { success: false, error: 'No computer action provided.' };
        }

        try {
            let output: string | undefined;

            switch (actionType) {
                case 'screenshot':
                    const base64 = await computer.takeScreenshot();
                    return {
                        success: true,
                        output: 'Screenshot captured.',
                        content: [{ type: 'image', data: base64, mimeType: 'image/png' }]
                    };
                case 'left_click':
                    await computer.leftClick(args.coordinate[0], args.coordinate[1], args.text);
                    break;
                case 'type':
                    await computer.typeText(args.text);
                    break;
                case 'key':
                    await computer.pressKey(args.key || args.text);
                    break;
                case 'mouse_move':
                    await computer.mouseMove(args.coordinate[0], args.coordinate[1]);
                    break;
                case 'scroll':
                    await computer.scroll(args.coordinate[0], args.coordinate[1], args.scroll_direction, args.scroll_amount, args.text);
                    break;
                case 'left_click_drag':
                    await computer.leftClickDrag(args.start_coordinate[0], args.start_coordinate[1], args.end_coordinate[0], args.end_coordinate[1]);
                    break;
                case 'right_click':
                    await computer.rightClick(args.coordinate[0], args.coordinate[1], args.text);
                    break;
                case 'middle_click':
                    await computer.middleClick(args.coordinate[0], args.coordinate[1], args.text);
                    break;
                case 'double_click':
                    await computer.doubleClick(args.coordinate[0], args.coordinate[1], args.text);
                    break;
                case 'triple_click':
                    await computer.tripleClick(args.coordinate[0], args.coordinate[1], args.text);
                    break;
                case 'left_mouse_down':
                    await computer.leftMouseDown(args.coordinate[0], args.coordinate[1]);
                    break;
                case 'left_mouse_up':
                    await computer.leftMouseUp(args.coordinate[0], args.coordinate[1]);
                    break;
                case 'hold_key':
                    await computer.holdKey(args.key || args.text, args.duration);
                    break;
                case 'wait':
                    await computer.wait(args.duration);
                    break;
                case 'zoom':
                    output = await computer.zoom(args.region[0], args.region[1], args.region[2], args.region[3]);
                    break;
                default:
                    return { success: false, error: `Unknown computer action: ${actionType}` };
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
export class ToolRegistry {
    private tools = new Map<string, Tool>();

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
        this.register(UnscheduleTool); // Registered the new tool
        this.register(MemoryTool);
        this.register(ComputerUseTool);
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
    description: 'List all active scheduled background tasks',
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
