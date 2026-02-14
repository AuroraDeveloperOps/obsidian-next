import { bus } from './bus.js';
import { initCommand } from '../commands/init.js';
import { clearCommand } from '../commands/clear.js';
import { contextCommand } from '../commands/context.js';
import { modelsCommand } from '../commands/models.js';
import { toolCommand } from '../commands/tool.js';
import { statusCommand } from '../commands/status.js';
import { sandboxCommand } from '../commands/sandbox.js';
import { modeCommand } from '../commands/mode.js';
import { taskCommand } from '../commands/task.js';
import { undoCommand } from '../commands/undo.js';
import { configCommand } from '../commands/config.js';
import { doctorCommand } from '../commands/doctor.js';
import { settingsCommand } from '../commands/settings.js';
import { exitCommand } from '../commands/exit.js';
import { resumeCommand } from '../commands/resume.js';
import { diffCommand } from '../commands/diff.js';
import { pilotCommand } from '../commands/pilot.js';
import { scheduledTasksCommand } from '../commands/scheduled_tasks.js';
import { scheduleCommand } from '../commands/schedule.js';
import { memoryCommand } from '../commands/memory.js';
import { ollamaCommand } from '../commands/ollama.js';
import { skillsCommand } from '../commands/skills.js';

export type CommandHandler = (args: string[]) => Promise<void>;

interface CommandDef {
	name: string;
	description: string;
	handler: CommandHandler;
	isView?: boolean;
	viewId?: string;
	aliases?: string[];
}

export class CommandRegistry {
	private commands: Map<string, CommandDef> = new Map();
	private aliases: Map<string, string> = new Map();

	constructor() {
		this.register(
			'help',
			'Show available commands',
			async () => {
				bus.emitAgent({ type: 'view_request', viewId: 'help', command: 'help' });
			},
			{ isView: true, viewId: 'help' }
		);

		this.register('init', 'Initialize configuration', initCommand, {
			isView: true,
			viewId: 'init'
		});
		this.register('clear', 'Clear conversation history', clearCommand);
		this.register('context', 'Show session context & usage', contextCommand, {
			isView: true,
			viewId: 'usage',
			aliases: ['usage', 'cost']
		});
		this.register('models', 'Select AI model', modelsCommand, {
			isView: true,
			viewId: 'models'
		});
		this.register('tool', 'View/execute tools', toolCommand, {
			isView: true,
			viewId: 'tool_list'
		});
		this.register('status', 'Show system status', statusCommand, {
			isView: true,
			viewId: 'status',
			aliases: ['doctor']
		});
		this.register('sandbox', 'Toggle sandbox mode', sandboxCommand, {
			isView: true,
			viewId: 'settings'
		});
		this.register('mode', 'Set execution mode (auto/plan/safe)', modeCommand, {
			isView: true,
			viewId: 'mode_select'
		});
		this.register('task', 'View/manage current task', taskCommand, {
			isView: true,
			viewId: 'task'
		});
		this.register('undo', 'Undo recent file changes', undoCommand, {
			isView: true,
			viewId: 'undo'
		});
		this.register('config', 'View/edit configuration', configCommand, {
			isView: true,
			viewId: 'settings'
		});
		this.register('doctor', 'Run diagnostics', doctorCommand, {
			isView: true,
			viewId: 'doctor'
		});
		this.register(
			'settings',
			'View/edit settings (mode, permissions, ui)',
			settingsCommand,
			{ isView: true, viewId: 'settings' }
		);
		this.register('exit', 'Save session and exit gracefully', exitCommand);
		this.register('resume', 'Restore a saved session', resumeCommand, {
			isView: true,
			viewId: 'sessions',
			aliases: ['sessions']
		});
		this.register('diff', 'View recent file changes', diffCommand, {
			isView: true,
			viewId: 'diff_list'
		});
		this.register(
			'mcp',
			'Manage Model Context Protocol',
			async (_args) => {
				bus.emitAgent({ type: 'view_request', viewId: 'mcp', command: 'mcp' });
			},
			{ isView: true, viewId: 'mcp', aliases: ['plugin'] }
		);
		this.register('pilot', 'Enable/disable Computer Use mode', pilotCommand, {
			isView: true,
			viewId: 'pilot',
			aliases: ['computer', 'desktop']
		});
		this.register('schedule', 'Schedule a background task', scheduleCommand, {
			isView: true,
			viewId: 'scheduler'
		});
		this.register(
			'scheduled_tasks',
			'List all scheduled background tasks',
			scheduledTasksCommand,
			{ isView: true, viewId: 'scheduled_tasks', aliases: ['tasks'] }
		);
		this.register('memory', 'Manage agent memory', memoryCommand, {
			isView: true,
			viewId: 'memory'
		});
		this.register('ollama', 'Ollama model registry', ollamaCommand, {
			isView: true,
			viewId: 'ollama'
		});
		this.register('skills', 'Manage default and custom skills', skillsCommand, {
			isView: true,
			viewId: 'skills',
			aliases: ['skill']
		});
	}

	register(
		name: string,
		description: string,
		handler: CommandHandler,
		options: Partial<Pick<CommandDef, 'isView' | 'viewId' | 'aliases'>> = {}
	) {
		const def = { name, description, handler, ...options };
		this.commands.set(name, def);

		if (options.aliases) {
			for (const alias of options.aliases) {
				this.aliases.set(alias, name);
			}
		}
	}

	has(name: string): boolean {
		return this.commands.has(name) || this.aliases.has(name);
	}

	async execute(name: string, args: string[]) {
		const actualName = this.aliases.get(name) || name;
		const cmd = this.commands.get(actualName);
		if (!cmd) {
			bus.emitAgent({
				type: 'error',
				message: `Unknown command: /${name}`
			});
			return;
		}

		try {
			// For view commands without args, the handler itself emits view_request
			// Just call the handler and let it decide
			await cmd.handler(args);

			bus.emitAgent({
				type: 'command_executed',
				command: actualName,
				args: args
			});
		} catch (error) {
			bus.emitAgent({
				type: 'error',
				message: `Command /${name} failed: ${error instanceof Error ? error.message : String(error)}`
			});
		}
	}
}

export const commands = new CommandRegistry();
