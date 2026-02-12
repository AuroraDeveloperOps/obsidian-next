/**
 * MCP Management Tool - Manage MCP servers
 */

import { mcp } from '../../core/mcp.js';
import {
	getRegistryDefinition,
	listRegistry
} from '../../core/mcp-registry.js';
import { Tool, ToolResult } from '../shared.js';

export const MCPManagementTool: Tool = {
	name: 'mcp_manage',
	description:
		'Manage MCP servers. actions: add, remove, install. Use "install" to easily add certified tools like "filesystem", "git", "research", or "context7".',
	inputSchema: {
		action: {
			type: 'string',
			description: 'Action to perform: add, remove, install'
		},
		name: {
			type: 'string',
			description:
				'Name of the server (e.g. "filesystem", "research", "context7")'
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

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const action = args.action as string;
		const name = args.name as string;

		if (action === 'install') {
			const def = getRegistryDefinition(name);
			if (!def) {
				const available = listRegistry()
					.map((r) => r.name)
					.join(', ');
				return {
					success: false,
					error: `Unknown registry item '${name}'. Available: ${available}`
				};
			}

			// Idempotency: Check if already exists
			const existing = mcp.getStatus().find((s) => s.name === name);
			if (existing && existing.connected) {
				return {
					success: true,
					output: `MCP server '${name}' is already installed and connected.`
				};
			}

			try {
				await mcp.addServer(name, {
					command: def.command,
					args: def.args,
					autoConnect: false,
					env: def.env
				});
				return {
					success: true,
					output: `Successfully installed and connected to certified MCP server '${name}' (${def.description})`
				};
			} catch (e: unknown) {
				return {
					success: false,
					error: `Failed to install server: ${e instanceof Error ? e.message : String(e)}`
				};
			}
		}

		if (action === 'add') {
			if (!args.command)
				return {
					success: false,
					error: 'Command is required for "add" action'
				};
			const command = args.command as string;
			const commandArgs = ((args.args as string) || '')
				.split(' ')
				.filter((a) => a.length > 0);

			try {
				await mcp.addServer(name, {
					command,
					args: commandArgs,
					autoConnect: false
				});
				return {
					success: true,
					output: `Successfully added and connected to MCP server '${name}'`
				};
			} catch (e: unknown) {
				return {
					success: false,
					error: `Failed to add server: ${e instanceof Error ? e.message : String(e)}`
				};
			}
		}

		if (action === 'remove') {
			try {
				await mcp.removeServer(name);
				return {
					success: true,
					output: `Successfully removed MCP server '${name}'`
				};
			} catch (e: unknown) {
				return {
					success: false,
					error: `Failed to remove server: ${e instanceof Error ? e.message : String(e)}`
				};
			}
		}

		if (action === 'connect') {
			try {
				const status = mcp.getStatus().find((s) => s.name === name);
				if (!status)
					return {
						success: false,
						error: `Server '${name}' not found in config`
					};
				if (status.connected)
					return {
						success: true,
						output: `Server '${name}' is already connected`
					};

				await mcp.connect(name, status.config);
				return {
					success: true,
					output: `Successfully connected to MCP server '${name}'`
				};
			} catch (e: unknown) {
				return {
					success: false,
					error: `Failed to connect: ${e instanceof Error ? e.message : String(e)}`
				};
			}
		}

		if (action === 'disconnect') {
			try {
				await mcp.disconnect(name);
				return {
					success: true,
					output: `Successfully disconnected MCP server '${name}'`
				};
			} catch (e: unknown) {
				return {
					success: false,
					error: `Failed to disconnect: ${e instanceof Error ? e.message : String(e)}`
				};
			}
		}

		if (action === 'status') {
			const status = mcp.getStatus().find((s) => s.name === name);
			if (!status)
				return { success: false, error: `Server '${name}' not found` };
			return {
				success: true,
				output: `Server: ${name}\nStatus: ${status.connected ? 'Connected' : 'Disconnected'}\nTools: ${status.capabilities ? 'Available' : 'N/A'}`
			};
		}

		return { success: false, error: `Unknown action: ${action}` };
	}
};
