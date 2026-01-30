/**
 * MCP Server - Exposes Obsidian tools via Model Context Protocol
 *
 * This allows other AI agents/clients to use our tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Safety limits
const MAX_OUTPUT_LENGTH = 10000;
const MAX_FILE_READ_LINES = 500;
const IGNORED_DIRS = ['node_modules', '.git', 'dist', '.next', '__pycache__', '.cache'];

function truncateOutput(output: string, maxLength: number = MAX_OUTPUT_LENGTH): string {
    if (output.length <= maxLength) return output;
    return `${output.slice(0, maxLength)}\n\n... [TRUNCATED: ${output.length - maxLength} more characters]`;
}

export function createMcpServer() {
    const server = new McpServer(
        {
            name: 'obsidian-next',
            version: '0.1.0',
        },
        {
            capabilities: {
                tools: {},
                resources: {},
            },
        }
    );

    // ==================== TOOLS ====================

    // Bash Tool
    server.registerTool(
        'bash',
        {
            title: 'Execute Shell Command',
            description: 'Execute a shell command in the workspace. Use for git, npm, and other CLI operations.',
            inputSchema: {
                command: z.string().describe('The shell command to execute'),
                timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
            },
        },
        async ({ command, timeout }) => {
            // Block dangerous patterns
            const blocked = ['rm -rf /', 'mkfs', 'dd if=', ':(){:|:&};:'];
            if (blocked.some(p => command.includes(p))) {
                return {
                    content: [{ type: 'text', text: 'Error: Blocked dangerous command pattern' }],
                    isError: true,
                };
            }

            try {
                const { stdout, stderr } = await execAsync(command, {
                    cwd: process.cwd(),
                    timeout: timeout || 30000,
                    maxBuffer: 1024 * 1024,
                });
                return {
                    content: [{ type: 'text', text: truncateOutput(stdout || stderr || 'Command executed successfully') }],
                };
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `Error: ${error.message}` }],
                    isError: true,
                };
            }
        }
    );

    // Read Tool
    server.registerTool(
        'read',
        {
            title: 'Read File',
            description: 'Read contents of a file with line numbers',
            inputSchema: {
                path: z.string().describe('File path relative to workspace'),
                offset: z.number().optional().describe('Starting line (1-indexed)'),
                limit: z.number().optional().describe('Number of lines to read'),
            },
        },
        async ({ path: filePath, offset, limit }) => {
            try {
                const fullPath = path.resolve(process.cwd(), filePath);

                // Security: ensure within workspace
                if (!fullPath.startsWith(process.cwd())) {
                    return {
                        content: [{ type: 'text', text: 'Error: Path outside workspace' }],
                        isError: true,
                    };
                }

                const content = await fs.readFile(fullPath, 'utf-8');
                const lines = content.split('\n');

                const startLine = (offset || 1) - 1;
                const endLine = limit ? startLine + limit : Math.min(startLine + MAX_FILE_READ_LINES, lines.length);
                const selectedLines = lines.slice(startLine, endLine);

                const numbered = selectedLines
                    .map((line, i) => `${String(startLine + i + 1).padStart(4)} | ${line}`)
                    .join('\n');

                const truncationNote = lines.length > endLine
                    ? `\n\n... [${lines.length - endLine} more lines]`
                    : '';

                return {
                    content: [{
                        type: 'text',
                        text: `File: ${filePath} (${lines.length} lines)\n${'='.repeat(60)}\n${numbered}${truncationNote}`
                    }],
                };
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `Error: ${error.message}` }],
                    isError: true,
                };
            }
        }
    );

    // Write Tool
    server.registerTool(
        'write',
        {
            title: 'Create File',
            description: 'Create a new file (fails if file exists)',
            inputSchema: {
                path: z.string().describe('File path relative to workspace'),
                content: z.string().describe('File content'),
            },
        },
        async ({ path: filePath, content }) => {
            try {
                const fullPath = path.resolve(process.cwd(), filePath);

                if (!fullPath.startsWith(process.cwd())) {
                    return {
                        content: [{ type: 'text', text: 'Error: Path outside workspace' }],
                        isError: true,
                    };
                }

                // Check if exists
                try {
                    await fs.access(fullPath);
                    return {
                        content: [{ type: 'text', text: 'Error: File already exists. Use edit tool instead.' }],
                        isError: true,
                    };
                } catch {
                    // Good - file doesn't exist
                }

                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, content, 'utf-8');

                return {
                    content: [{ type: 'text', text: `Created: ${filePath} (${content.length} bytes)` }],
                };
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `Error: ${error.message}` }],
                    isError: true,
                };
            }
        }
    );

    // Edit Tool
    server.registerTool(
        'edit',
        {
            title: 'Edit File',
            description: 'Edit an existing file using search/replace',
            inputSchema: {
                path: z.string().describe('File path relative to workspace'),
                search: z.string().describe('Text to find'),
                replace: z.string().describe('Text to replace with'),
            },
        },
        async ({ path: filePath, search, replace }) => {
            try {
                const fullPath = path.resolve(process.cwd(), filePath);

                if (!fullPath.startsWith(process.cwd())) {
                    return {
                        content: [{ type: 'text', text: 'Error: Path outside workspace' }],
                        isError: true,
                    };
                }

                const original = await fs.readFile(fullPath, 'utf-8');

                if (!original.includes(search)) {
                    return {
                        content: [{ type: 'text', text: 'Error: Search string not found in file' }],
                        isError: true,
                    };
                }

                const modified = original.replace(search, replace);
                await fs.writeFile(fullPath, modified, 'utf-8');

                const originalLines = original.split('\n').length;
                const modifiedLines = modified.split('\n').length;
                const delta = modifiedLines - originalLines;

                return {
                    content: [{
                        type: 'text',
                        text: `Edited: ${filePath}\nLines: ${originalLines} -> ${modifiedLines} (${delta >= 0 ? '+' : ''}${delta})`
                    }],
                };
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `Error: ${error.message}` }],
                    isError: true,
                };
            }
        }
    );

    // List Tool
    server.registerTool(
        'list',
        {
            title: 'List Directory',
            description: 'List files and directories',
            inputSchema: {
                path: z.string().optional().describe('Directory path (default: current directory)'),
            },
        },
        async ({ path: dirPath }) => {
            try {
                const fullPath = path.resolve(process.cwd(), dirPath || '.');

                if (!fullPath.startsWith(process.cwd())) {
                    return {
                        content: [{ type: 'text', text: 'Error: Path outside workspace' }],
                        isError: true,
                    };
                }

                const entries = await fs.readdir(fullPath, { withFileTypes: true });
                const filtered = entries.filter(e =>
                    !IGNORED_DIRS.includes(e.name) && !e.name.startsWith('.')
                );

                const formatted = filtered
                    .map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`)
                    .join('\n');

                const hiddenCount = entries.length - filtered.length;
                const note = hiddenCount > 0 ? `\n\n(${hiddenCount} hidden)` : '';

                return {
                    content: [{ type: 'text', text: `Directory: ${dirPath || '.'}\n${formatted}${note}` }],
                };
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `Error: ${error.message}` }],
                    isError: true,
                };
            }
        }
    );

    // Grep Tool
    server.registerTool(
        'grep',
        {
            title: 'Search Content',
            description: 'Search for patterns in files using regex',
            inputSchema: {
                pattern: z.string().describe('Regex pattern to search'),
                path: z.string().optional().describe('Directory to search (default: current)'),
                limit: z.number().optional().describe('Max results (default: 50)'),
            },
        },
        async ({ pattern, path: searchPath, limit }) => {
            try {
                const maxResults = limit || 50;
                const results: string[] = [];

                async function searchDir(dir: string, depth: number = 0) {
                    if (results.length >= maxResults || depth > 10) return;

                    const entries = await fs.readdir(dir, { withFileTypes: true });
                    const regex = new RegExp(pattern, 'gi');

                    for (const entry of entries) {
                        if (results.length >= maxResults) break;
                        if (entry.name.startsWith('.') || IGNORED_DIRS.includes(entry.name)) continue;

                        const fullPath = path.join(dir, entry.name);
                        const relativePath = path.relative(process.cwd(), fullPath);

                        if (entry.isDirectory()) {
                            await searchDir(fullPath, depth + 1);
                        } else if (entry.isFile()) {
                            const ext = path.extname(entry.name).toLowerCase();
                            const textExts = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.yaml', '.yml', '.css', '.html'];

                            if (textExts.includes(ext) || ext === '') {
                                try {
                                    const content = await fs.readFile(fullPath, 'utf-8');
                                    const lines = content.split('\n');

                                    for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                                        if (regex.test(lines[i])) {
                                            results.push(`${relativePath}:${i + 1}: ${lines[i].trim().slice(0, 100)}`);
                                        }
                                        regex.lastIndex = 0;
                                    }
                                } catch { }
                            }
                        }
                    }
                }

                const startPath = path.resolve(process.cwd(), searchPath || '.');
                await searchDir(startPath);

                if (results.length === 0) {
                    return { content: [{ type: 'text', text: `No matches for: ${pattern}` }] };
                }

                return {
                    content: [{
                        type: 'text',
                        text: `Found ${results.length} matches:\n${results.join('\n')}`
                    }],
                };
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `Error: ${error.message}` }],
                    isError: true,
                };
            }
        }
    );

    // Glob Tool
    server.registerTool(
        'glob',
        {
            title: 'Find Files',
            description: 'Find files matching a glob pattern',
            inputSchema: {
                pattern: z.string().describe('Glob pattern (e.g., **/*.ts, src/**/*.tsx)'),
                path: z.string().optional().describe('Base directory'),
            },
        },
        async ({ pattern, path: basePath }) => {
            try {
                const results: string[] = [];
                const maxResults = 100;

                async function globSearch(dir: string, depth: number = 0) {
                    if (results.length >= maxResults || depth > 15) return;

                    const entries = await fs.readdir(dir, { withFileTypes: true });

                    const regexPattern = pattern
                        .replace(/\*\*/g, '{{GLOBSTAR}}')
                        .replace(/\*/g, '[^/]*')
                        .replace(/\?/g, '.')
                        .replace(/{{GLOBSTAR}}/g, '.*');
                    const regex = new RegExp(`^${regexPattern}$`);

                    for (const entry of entries) {
                        if (results.length >= maxResults) break;
                        if (entry.name.startsWith('.') || IGNORED_DIRS.includes(entry.name)) continue;

                        const fullPath = path.join(dir, entry.name);
                        const relativePath = path.relative(process.cwd(), fullPath);

                        if (entry.isDirectory()) {
                            if (pattern.includes('**') || pattern.includes('/')) {
                                await globSearch(fullPath, depth + 1);
                            }
                        } else if (entry.isFile()) {
                            if (regex.test(relativePath) || regex.test(entry.name)) {
                                results.push(relativePath);
                            }
                        }
                    }
                }

                const startPath = path.resolve(process.cwd(), basePath || '.');
                await globSearch(startPath);

                if (results.length === 0) {
                    return { content: [{ type: 'text', text: `No files matching: ${pattern}` }] };
                }

                return {
                    content: [{ type: 'text', text: `Found ${results.length} files:\n${results.join('\n')}` }],
                };
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `Error: ${error.message}` }],
                    isError: true,
                };
            }
        }
    );

    // Web Fetch Tool
    server.registerTool(
        'web_fetch',
        {
            title: 'Fetch URL',
            description: 'Fetch content from a URL',
            inputSchema: {
                url: z.string().url().describe('URL to fetch'),
            },
        },
        async ({ url }) => {
            try {
                const urlObj = new URL(url);
                const blocked = ['localhost', '127.0.0.1', '0.0.0.0'];
                if (blocked.some(d => urlObj.hostname.includes(d))) {
                    return {
                        content: [{ type: 'text', text: 'Error: Cannot fetch from local addresses' }],
                        isError: true,
                    };
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: { 'User-Agent': 'Obsidian-Next-MCP/1.0' },
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    return {
                        content: [{ type: 'text', text: `Error: HTTP ${response.status}` }],
                        isError: true,
                    };
                }

                let content = await response.text();
                const contentType = response.headers.get('content-type') || '';

                // Strip HTML tags if HTML content
                if (contentType.includes('text/html')) {
                    content = content
                        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                }

                return {
                    content: [{
                        type: 'text',
                        text: truncateOutput(`URL: ${url}\nContent-Type: ${contentType}\n${'='.repeat(60)}\n${content}`)
                    }],
                };
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `Error: ${error.message}` }],
                    isError: true,
                };
            }
        }
    );

    // ==================== RESOURCES ====================

    // Workspace info resource
    server.registerResource(
        'workspace',
        'obsidian://workspace',
        {
            description: 'Current workspace information',
        },
        async () => ({
            contents: [{
                uri: 'obsidian://workspace',
                mimeType: 'application/json',
                text: JSON.stringify({
                    cwd: process.cwd(),
                    name: path.basename(process.cwd()),
                }, null, 2),
            }],
        })
    );

    return server;
}

export async function startMcpServer() {
    const server = createMcpServer();
    const transport = new StdioServerTransport();

    await server.connect(transport);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        await server.close();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        await server.close();
        process.exit(0);
    });
}
