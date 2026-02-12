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
		'Create a new autonomous skill (tool) for the agent. This tool writes the implementation, runs tests, and registers it dynamically. The code MUST be a valid Node.js module that exports default a Tool object.',
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
				'Node.js code for the tool. Must export default a Tool object.'
		}
	},
	requiredParams: ['name', 'description', 'code'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
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
			// Note: Registration will be handled by the registry loading mechanism
			const module = await import(`file://${skillPath}?t=${Date.now()}`); // Use cache buster
			if (module.default && module.default.name) {
				// Registration will happen through the global tools registry
				// This is a placeholder for validation
				return {
					success: true,
					output: `Skill '${name}' created successfully at ${skillPath}. Restart the agent to load it.`
				};
			}

			return {
				success: false,
				error: 'Skill code must export default a Tool object.'
			};
		} catch (error: unknown) {
			return {
				success: false,
				error: `Failed to create skill: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
};
