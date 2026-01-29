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

const execAsync = promisify(exec);

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
        if (!audit.approved) {
            return {
                success: false,
                error: `Security violation: ${audit.reason}`
            };
        }

        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: process.cwd(),
                timeout: 30000, // 30 second timeout
                maxBuffer: 1024 * 1024 * 10, // 10MB buffer
            });

            return {
                success: true,
                output: stdout || stderr || 'Command executed successfully',
            };
        } catch (error: any) {
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

        try {
            const fullPath = path.resolve(process.cwd(), filePath);
            const content = await fs.readFile(fullPath, 'utf-8');

            // Add line numbers for better readability
            const lines = content.split('\n');
            const numbered = lines
                .map((line, i) => `${String(i + 1).padStart(4)} | ${line}`)
                .join('\n');

            return {
                success: true,
                output: `File: ${filePath}\n${'='.repeat(60)}\n${numbered}`,
            };
        } catch (error: any) {
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

            return {
                success: true,
                output: `Created file: ${filePath} (${content.length} bytes)`,
            };
        } catch (error: any) {
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

            // Perform replacement
            const modified = original.replace(search, replace);

            // Write back
            await fs.writeFile(fullPath, modified, 'utf-8');

            // Calculate change stats
            const originalLines = original.split('\n').length;
            const modifiedLines = modified.split('\n').length;
            const delta = modifiedLines - originalLines;

            return {
                success: true,
                output: `Edited ${filePath}: ${originalLines} → ${modifiedLines} lines (${delta >= 0 ? '+' : ''}${delta})`,
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to edit file: ${error.message}`,
            };
        }
    },
};

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

            const formatted = entries
                .map(entry => {
                    const prefix = entry.isDirectory() ? '[DIR]' : '[FILE]';
                    return `${prefix} ${entry.name}`;
                })
                .join('\n');

            return {
                success: true,
                output: `Directory: ${dirPath}\n${'='.repeat(60)}\n${formatted}`,
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
