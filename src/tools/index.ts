/**
 * Tool Registry - Central registry for all tools
 */

import fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import os from 'os';
import { bus } from '../core/bus.js';
import { mcp } from '../core/mcp.js';
import { skillsManager } from '../core/skills.js';
import { redactor } from '../core/redactor.js';
import { READ_LANE, WRITE_LANE, EXEC_LANE, NETWORK_LANE } from '../core/lane.js';
import {
	Tool,
	ToolResult,
	ToolContentBlock,
	ToolParameterSchema
} from './shared.js';

// Import all filesystem tools
import { ReadTool } from './filesystem/read.js';
import { WriteTool } from './filesystem/write.js';
import { EditTool } from './filesystem/edit.js';
import { ListTool } from './filesystem/list.js';
import { GrepTool } from './filesystem/grep.js';
import { GlobTool } from './filesystem/glob.js';
import { DeleteTool } from './filesystem/delete.js';

// Import execution tools
import { BashTool } from './execution/bash.js';
import { ComputerUseTool } from './execution/computer.js';

// Import network tools
import { WebFetchTool } from './network/web-fetch.js';
import { HttpRequestTool } from './network/http.js';

// Import system tools
import { TaskTool } from './system/task.js';
import { NotifyTool } from './system/notify.js';
import { UnscheduleTool } from './system/unschedule.js';
import { ScheduleTool } from './system/schedule.js';
import { ListScheduledTasksTool } from './system/list-scheduled.js';
import { CreateSkillTool } from './system/create-skill.js';
import { MemoryTool } from './system/memory.js';

// Import MCP tools
import { MCPManagementTool } from './mcp/manage.js';

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
		this.register(HttpRequestTool);
		this.register(DeleteTool);
		this.register(NotifyTool);
	}

	async init() {
		await skillsManager.init();
		await this.loadDefaultSkills();
		await this.loadUserSkills();
	}

	/**
	 * Load built-in default skills from src/skills/defaults/
	 * These are bundled with the app and always available
	 */
	private async loadDefaultSkills() {
		try {
			const defaultSkillsDir = path.join(
				path.dirname(new URL(import.meta.url).pathname),
				'..', 'skills', 'defaults'
			);

			if (!fsSync.existsSync(defaultSkillsDir)) return;

			const files = await fs.readdir(defaultSkillsDir);
			for (const file of files) {
				if (file.endsWith('.js') || file.endsWith('.mjs')) {
					try {
						const skillPath = path.join(defaultSkillsDir, file);
						const module = await import(`file://${skillPath}?t=${Date.now()}`);
						if (module.default && module.default.name) {
							// Don't override user skills; skip disabled skills
							if (!this.tools.has(module.default.name) && !skillsManager.isDisabled(module.default.name)) {
								this.register(module.default);
							}
						}
					} catch (e) {
						// Silent fail for default skills - non-critical
					}
				}
			}
		} catch {
			// Default skills dir might not exist in dist - that's ok
		}
	}

	/**
	 * Load user-created skills from ~/.obsidian-next/skills/
	 * These override default skills with the same name
	 */
	private async loadUserSkills() {
		if (!fsSync.existsSync(this.skillsDir)) {
			fsSync.mkdirSync(this.skillsDir, { recursive: true });
		}

		try {
			const files = await fs.readdir(this.skillsDir);
			for (const file of files) {
				if (file.endsWith('.js') || file.endsWith('.mjs')) {
					try {
						const skillPath = path.join(this.skillsDir, file);

						// Safety: Read file content first and skip files with top-level
						// side effects (await/spawn/exec outside export default).
						// This prevents scripts from auto-executing on import.
						const content = await fs.readFile(skillPath, 'utf-8');
						if (!content.includes('export default')) {
							bus.emitAgent({
								type: 'thought',
								content: `[Skills] Skipped ${file}: no export default (not a valid skill)`,
								hidden: true
							});
							continue;
						}

						// Check for top-level await outside of function bodies
						// (indicates side-effect script, not a skill definition)
						const stripped = content.replace(/async\s+(execute|function)\s*\([^)]*\)\s*\{[\s\S]*?\n\}/g, '');
						if (/^(await|spawn|exec)\s/m.test(stripped)) {
							bus.emitAgent({
								type: 'thought',
								content: `[Skills] Skipped ${file}: contains top-level side effects`,
								hidden: true
							});
							continue;
						}

						const module = await import(`file://${skillPath}?t=${Date.now()}`);
						if (module.default && module.default.name) {
							if (!skillsManager.isDisabled(module.default.name)) {
								this.register(module.default); // User skills override defaults
							}
						}
					} catch (e) {
						bus.emitAgent({
							type: 'thought',
							content: `[Skills] Failed to load ${file}: ${e instanceof Error ? e.message : String(e)}`,
							hidden: true
						});
					}
				}
			}
		} catch (e) {
			bus.emitAgent({
				type: 'thought',
				content: `[Skills] Failed to read skills directory: ${e instanceof Error ? e.message : String(e)}`,
				hidden: true
			});
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

	/**
	 * Select appropriate lane based on tool type for optimal concurrency
	 */
	private selectLane(toolName: string) {
		// Read operations - high concurrency (5x parallel)
		if (['read', 'list', 'grep', 'glob'].includes(toolName)) {
			return READ_LANE;
		}

		// Write operations - serialized (prevent race conditions)
		if (['write', 'edit', 'delete'].includes(toolName)) {
			return WRITE_LANE;
		}

		// Shell commands - serialized (prevent stdin/stdout collision)
		if (['bash', 'computer'].includes(toolName)) {
			return EXEC_LANE;
		}

		// Network operations - moderate concurrency (3x parallel)
		if (['web_fetch', 'http', 'http_request'].includes(toolName)) {
			return NETWORK_LANE;
		}

		// Default: use write lane for safety (serialized)
		return WRITE_LANE;
	}

	async list(): Promise<Tool[]> {
		const staticTools = Array.from(this.tools.values());

		try {
			const dynamicTools = await mcp.listTools();

			// Adapt MCP tools to internal Tool interface
			const mcpAdapters: Tool[] = dynamicTools.map((dt) => {
				interface MCPDynamicTool {
					server: string;
					name: string;
					description?: string;
					inputSchema?: {
						properties?: Record<string, ToolParameterSchema>;
						required?: string[];
					};
				}
				const mcpTool = dt as MCPDynamicTool;
				return {
					name: `${mcpTool.server}_${mcpTool.name}`,
					description: `[MCP: ${mcpTool.server}] ${mcpTool.description || ''}`,
					inputSchema: (mcpTool.inputSchema?.properties || {}) as Record<
						string,
						ToolParameterSchema
					>,
					requiredParams: mcpTool.inputSchema?.required || [],
					execute: async (args: Record<string, unknown>) => {
						const result = await mcp.callTool(
							mcpTool.server,
							mcpTool.name,
							args
						);

						if (result.isError) {
							return { success: false, error: 'MCP Tool Error' };
						}

						const output = result.content
							.filter((c): c is { type: 'text'; text: string } => 'text' in c)
							.map((c) => c.text)
							.join('\n');
						return {
							success: !result.isError,
							output,
							content: result.content as unknown as ToolContentBlock[]
						};
					}
				};
			});

			return [...staticTools, ...mcpAdapters];
		} catch (error) {
			bus.emitAgent({
				type: 'thought',
				content: `[MCP] Failed to list tools: ${error instanceof Error ? error.message : String(error)}`,
				hidden: true
			});
			return staticTools;
		}
	}

	async execute(
		name: string,
		args: Record<string, unknown>
	): Promise<ToolResult> {
		let tool = this.tools.get(name);

		// If not a built-in tool, check if it's an MCP tool
		if (!tool) {
			const mcpTools = await this.list();
			tool = mcpTools.find((t) => t.name === name);
		}

		if (!tool) {
			return {
				success: false,
				error: `Unknown tool: ${name}. Available: ${(await this.list()).map((t) => t.name).join(', ')}`
			};
		}

		// Emit tool_start event
		bus.emitAgent({
			type: 'tool_start',
			tool: name,
			args: JSON.stringify(args, null, 2)
		});

		// Execute tool through appropriate Lane Queue based on operation type
		const lane = this.selectLane(name);
		const result = await lane.enqueue(() => tool!.execute(args));

		// Emit tool_result event
		// Redact PII from output before emitting to event bus (visible to UI/History)
		const rawOutput = result.success
			? result.output || 'Success'
			: result.error || 'Failed';
		const redacted = redactor.redactToolOutput(name, rawOutput);

		bus.emitAgent({
			type: 'tool_result',
			tool: name,
			output: redacted.text,
			isError: !result.success
		});

		return result;
	}
}

// Export singleton instance
export const tools = new ToolRegistry();

// Re-export types
export type { Tool, ToolResult, ToolContentBlock, ToolParameterSchema };
