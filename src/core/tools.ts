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
import { undo } from './undo.js';
import { settings } from './settings.js';
import { auditLog } from './auditLog.js';
import { UserEvent } from '../events/types.js';

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

// Pending approval requests
const pendingApprovals = new Map<string, {
    resolve: (approved: boolean) => void;
    timeout: NodeJS.Timeout;
}>();

// Listen for approval responses
bus.on('user', (event: UserEvent) => {
    if (event.type === 'approval_response') {
        const pending = pendingApprovals.get(event.requestId);
        if (pending) {
            clearTimeout(pending.timeout);
            pendingApprovals.delete(event.requestId);
            pending.resolve(event.approved);
        }
    }
});

/**
 * Request user approval for a command
 */
async function requestApproval(command: string, reason: string): Promise<boolean> {
    const requestId = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve) => {
        // Set timeout - auto-deny after timeout
        const timeout = setTimeout(() => {
            pendingApprovals.delete(requestId);
            bus.emitAgent({
                type: 'error',
                message: 'Approval request timed out. Command denied.'
            });
            resolve(false);
        }, APPROVAL_TIMEOUT);

        pendingApprovals.set(requestId, { resolve, timeout });

        bus.emitAgent({
            type: 'approval_request',
            requestId,
            context: `Command: ${command}\nReason: ${reason}`,
        });
    });
}

export interface ToolResult {
    success: boolean;
    output?: string;
    error?: string;
}

export interface Tool {
    name: string;
    description: string;
    execute: (args: Record<string, any>) => Promise<ToolResult>;
}

/**
 * Bash Tool - Execute shell commands with auditor safety checks
 */
export const BashTool: Tool = {
    name: 'bash',
    description: 'Execute shell commands in the workspace',

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

            const approved = await requestApproval(command, audit.reason || 'Potentially dangerous operation');

            if (!approved) {
                // Save denial and log it
                await settings.addDeniedPermission('bash', command);
                await auditLog.logApproval('denied', command);
                return {
                    success: false,
                    error: 'Command rejected by user'
                };
            }

            // Save approval for future (user said yes) and log it
            await settings.addAllowedPermission('bash', command);
            await auditLog.logApproval('granted', command);
        }

        // Auto-approved commands (in allow list) skip confirmation
        // audit.approved && audit.autoApproved === true means pre-approved

        try {
            // Wrap command with sandbox if enabled
            const execCommand = await sandbox.wrapCommand(command);

            const { stdout, stderr } = await execAsync(execCommand, {
                cwd: process.cwd(),
                timeout: 30000, // 30 second timeout
                maxBuffer: 1024 * 1024, // 1MB buffer (reduced from 10MB)
            });

            const output = stdout || stderr || 'Command executed successfully';

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

            // Track in context, undo, and audit log
            await context.trackModified(filePath);
            await undo.recordChange(filePath, 'create', null, content);
            await auditLog.logFileOperation('write', filePath, true);

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

            // Track in context, undo, and audit log
            await context.trackModified(filePath);
            await undo.recordChange(filePath, 'edit', original, modified);
            await auditLog.logFileOperation('edit', filePath, true);

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
 * WebFetch Tool - Fetch content from URLs
 */
export const WebFetchTool: Tool = {
    name: 'web_fetch',
    description: 'Fetch content from a URL (for documentation, APIs, etc.)',

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
        this.register(WebFetchTool);
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

    list(): Tool[] {
        return Array.from(this.tools.values());
    }

    async execute(name: string, args: Record<string, any>): Promise<ToolResult> {
        const tool = this.tools.get(name);

        if (!tool) {
            return {
                success: false,
                error: `Unknown tool: ${name}`
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
        bus.emitAgent({
            type: 'tool_result',
            tool: name,
            output: result.success ? (result.output || 'Success') : (result.error || 'Failed'),
            isError: !result.success,
        });

        return result;
    }
}

export const tools = new ToolRegistry();
