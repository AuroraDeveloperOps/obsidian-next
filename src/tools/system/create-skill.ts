/**
 * Create Skill Tool - Autonomous tool generation
 */

import fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import os from 'os';
import { Tool, ToolResult } from '../shared.js';

export const CreateSkillTool: Tool = {
	name: 'create_skill',
	description:
		'Create a new autonomous skill (tool) for the agent. This tool writes the implementation and registers it dynamically. The code MUST be a valid Node.js ESM module that exports default a Tool object. DO NOT USE Python, Classes, or pseudo-code. TEMPLATE: export default { name: "...", description: "...", inputSchema: { param: { type: "string", description: "..." } }, requiredParams: ["param"], async execute(args) { return { success: true, output: "..." }; } };',
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
			description:
				'Node.js ESM code for the tool. Must start with "export default {" and follow the Tool interface.'
		}
	},
	requiredParams: ['name', 'description', 'code'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const name = args.name as string;
		const code = (args.code as string).trim();
		const skillsDir = path.join(os.homedir(), '.obsidian-next', 'skills');
		const skillPath = path.join(skillsDir, `${name}.mjs`);

		// Basic validation
		if (code.includes('def ') || code.includes('import ') && !code.includes('from')) {
			return {
				success: false,
				error: 'Failed to create skill: Detected non-JS syntax (likely Python or invalid imports). Code must be valid Node.js ESM.'
			};
		}

		if (!code.startsWith('export default')) {
			return {
				success: false,
				error: 'Failed to create skill: Code must start with "export default {". Classes and bare blocks are not allowed.'
			};
		}

		try {
			if (!fsSync.existsSync(skillsDir)) {
				fsSync.mkdirSync(skillsDir, { recursive: true });
			}

			await fs.writeFile(skillPath, code, 'utf-8');

			// Dynamically import and register
			const module = await import(`file://${skillPath}?t=${Date.now()}`); 
			if (module.default && module.default.name) {
				return {
					success: true,
					output: `Skill '${name}' created successfully at ${skillPath}. Restart the agent to load it.`
				};
			}

			return {
				success: false,
				error: 'Skill code must export default a Tool object with a name property.'
			};
		} catch (error: unknown) {
			// Clean up failed file
			try { await fs.unlink(skillPath); } catch {}
			
			return {
				success: false,
				error: `Failed to create skill (Syntax Error): ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
};
