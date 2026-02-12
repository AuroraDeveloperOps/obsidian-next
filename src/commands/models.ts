/**
 * Models Command - Model selection and provider management
 *
 * /models - Show Claude model selection menu
 * /models <1-4|name> - Select Claude model
 * /models list - List installed Ollama models
 * /models pull <name> - Download an Ollama model
 * /models status - Show provider status
 * /models switch <provider> - Switch provider mode
 */

import { bus } from '../core/bus.js';
import { config } from '../core/config.js';
import { CommandHandler } from '../core/commands.js';

const CLAUDE_4_MODELS = [
	{ id: 'claude-opus-4-6-20260207', label: 'Opus 4.6 (Intelligence King)' },
	{ id: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5 (Balanced)' },
	{ id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (Fast)' },
	{ id: 'claude-opus-4-5-20251101', label: 'Opus 4.5 (Legacy Pro)' }
];

export const modelsCommand: CommandHandler = async (args) => {
	const currentConfig = await config.load();

	// Handle subcommands
	if (args.length > 0) {
		const subcommand = args[0].toLowerCase();

		switch (subcommand) {
			case 'list':
				await listOllamaModels(currentConfig);
				return;

			case 'pull':
				if (args.length < 2) {
					bus.emitAgent({
						type: 'error',
						message:
							'Usage: /models pull <model-name>\n\nExamples:\n  /models pull functiongemma\n  /models pull smollm'
					});
					return;
				}
				await pullOllamaModel(args[1], currentConfig);
				return;

			case 'status':
				await showProviderStatus(currentConfig);
				return;

			case 'switch':
				if (args.length < 2) {
					bus.emitAgent({
						type: 'error',
						message:
							'Usage: /models switch <mode>\n\nModes: anthropic, ollama, moe'
					});
					return;
				}
				await switchProvider(args[1] as any, currentConfig);
				return;

			default:
				// Try to handle as model selection
				await selectClaudeModel(args[0], currentConfig);
				return;
		}
	}

	// No args - show ALL available models (Claude + Ollama)
	const providerMode = (currentConfig as any).provider || 'anthropic';

	// Build Claude section
	const claudeSection = [
		'[CLAUDE MODELS]',
		...CLAUDE_4_MODELS.map(
			(m, i) =>
				`   ${i + 1}. ${m.label.padEnd(30)} ${currentConfig.model === m.id ? '[Current]' : ''}`
		),
		''
	];

	// Build Ollama section
	let ollamaSection: string[] = [];
	try {
		const baseUrl = currentConfig.ollama?.baseUrl || 'http://localhost:11434';
		const response = await fetch(`${baseUrl}/api/tags`, {
			signal: AbortSignal.timeout(2000)
		});

		if (response.ok) {
			const data = await response.json();
			const models = data.models || [];

			if (models.length > 0) {
				const currentTool = currentConfig.ollama?.models?.tool || 'functiongemma:latest';
				const currentChat = currentConfig.ollama?.models?.chat || 'smollm:latest';
				const currentReasoning = currentConfig.ollama?.models?.reasoning || 'smollm:latest';

				ollamaSection = [
					'[OLLAMA MODELS]',
					...models.map((m: any) => {
						const name = m.name;
						const isTool = name === currentTool;
						const isChat = name === currentChat;
						const isReasoning = name === currentReasoning;
						const marker = isTool ? ' [tool]' : isChat ? ' [chat]' : isReasoning ? ' [reasoning]' : '';
						return `   - ${name}${marker}`;
					}),
					''
				];
			} else {
				ollamaSection = [
					'[OLLAMA MODELS]',
					'   No models installed. Pull with: /models pull <name>',
					''
				];
			}
		} else {
			ollamaSection = [
				'[OLLAMA MODELS]',
				'   Ollama not running. Start with: ollama serve',
				''
			];
		}
	} catch {
		ollamaSection = [
			'[OLLAMA MODELS]',
			'   Ollama not available',
			''
		];
	}

	const content = [
		...claudeSection,
		...ollamaSection,
		`[PROVIDER MODE: ${providerMode.toUpperCase()}]`,
		'   ⎿  /models <1-4|name>      Select Claude model',
		'   ⎿  /models status          Show provider status',
		'   ⎿  /models switch <mode>   Change provider (anthropic/ollama/moe)',
		'   ⎿  /models pull <model>    Download Ollama model',
		''
	].join('\n');

	bus.emitAgent({
		type: 'thought',
		content
	});

	bus.emitAgent({
		type: 'done',
		summary: 'Model list displayed'
	});
};

async function selectClaudeModel(
	selection: string,
	currentConfig: any
): Promise<void> {
	const sel = selection.toLowerCase();
	let newModel: string | undefined;

	// Strict Selection Logic
	if (sel === '1' || sel === 'opus-4.6') {
		newModel = 'claude-opus-4-6-20260207';
	} else if (sel === '2' || sel === 'opus-4.5') {
		newModel = 'claude-opus-4-5-20251101';
	} else if (sel === '3' || sel === 'sonnet') {
		newModel = 'claude-sonnet-4-5-20250929';
	} else if (sel === '4' || sel === 'haiku') {
		newModel = 'claude-haiku-4-5-20251001';
	}

	if (!newModel) {
		bus.emitAgent({
			type: 'error',
			message: `Invalid selection: ${selection}. Choose from the Claude 4 family (1-4).`
		});
		return;
	}

	await config.save({
		...currentConfig,
		model: newModel
	});

	bus.emitAgent({
		type: 'done',
		summary: `Model switched to ${newModel}`
	});
}

async function listOllamaModels(currentConfig: any): Promise<void> {
	try {
		const baseUrl = currentConfig.ollama?.baseUrl || 'http://localhost:11434';
		const response = await fetch(`${baseUrl}/api/tags`, {
			signal: AbortSignal.timeout(2000)
		});

		if (!response.ok) {
			throw new Error('Ollama not running');
		}

		const data = await response.json();
		const models = data.models || [];

		if (models.length === 0) {
			bus.emitAgent({
				type: 'thought',
				content:
					'[Models] No Ollama models installed.\n\nInstall with:\n  ollama pull functiongemma\n  ollama pull smollm'
			});
			return;
		}

		const currentTool =
			currentConfig.ollama?.models?.tool || 'functiongemma:latest';
		const currentChat = currentConfig.ollama?.models?.chat || 'smollm:latest';

		const modelList = models
			.map((m: any) => {
				const name = m.name;
				const isTool = name === currentTool;
				const isChat = name === currentChat;
				const marker = isTool ? ' (tool)' : isChat ? ' (chat)' : '';
				return `  - ${name}${marker}`;
			})
			.join('\n');

		bus.emitAgent({
			type: 'thought',
			content: `[Models] Installed Ollama models:\n${modelList}\n\nTotal: ${models.length}`
		});

		bus.emitAgent({
			type: 'done',
			summary: `Found ${models.length} Ollama models`
		});
	} catch (error) {
		bus.emitAgent({
			type: 'error',
			message: `Failed to list Ollama models: ${error instanceof Error ? error.message : String(error)}`
		});
	}
}

async function pullOllamaModel(
	modelName: string,
	currentConfig: any
): Promise<void> {
	bus.emitAgent({
		type: 'thought',
		content: `[Models] Pulling ${modelName}... This may take a few minutes.`
	});

	try {
		const baseUrl = currentConfig.ollama?.baseUrl || 'http://localhost:11434';
		const response = await fetch(`${baseUrl}/api/pull`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: modelName, stream: false })
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		bus.emitAgent({
			type: 'done',
			summary: `Successfully pulled ${modelName}`
		});
	} catch (error) {
		bus.emitAgent({
			type: 'error',
			message: `Failed to pull ${modelName}: ${error instanceof Error ? error.message : String(error)}`
		});
	}
}

async function showProviderStatus(currentConfig: any): Promise<void> {
	try {
		const mode = currentConfig.provider || 'anthropic';

		// Check Anthropic availability (has API key)
		const anthropicAvailable =
			!!process.env.ANTHROPIC_API_KEY ||
			!!(await import('../core/keyManager.js')).keyManager.loadKey();

		// Check Ollama availability
		let ollamaAvailable = false;
		try {
			const baseUrl = currentConfig.ollama?.baseUrl || 'http://localhost:11434';
			const response = await fetch(`${baseUrl}/api/tags`, {
				signal: AbortSignal.timeout(2000)
			});
			ollamaAvailable = response.ok;
		} catch {
			ollamaAvailable = false;
		}

		const anthropicStatus = anthropicAvailable ? 'Available' : 'No API key';
		const ollamaStatus = ollamaAvailable ? 'Running' : 'Stopped';

		let status = `[Models] Provider Status:
  Mode: ${mode.toUpperCase()}

  Anthropic: ${anthropicStatus}
  - Model: ${currentConfig.model}

  Ollama: ${ollamaStatus}`;

		if (ollamaAvailable) {
			const ollamaConfig = currentConfig.ollama || {
				baseUrl: 'http://localhost:11434',
				models: {
					tool: 'functiongemma:latest',
					chat: 'smollm:latest',
					reasoning: 'smollm:latest'
				}
			};

			status += `
  - URL: ${ollamaConfig.baseUrl}
  - Tool Model: ${ollamaConfig.models.tool}
  - Chat Model: ${ollamaConfig.models.chat}
  - Reasoning Model: ${ollamaConfig.models.reasoning}`;
		}

		if (mode === 'moe') {
			status +=
				'\n\n[MoE Routing]:\n  tool_calling -> ' +
				(ollamaAvailable
					? currentConfig.ollama.models.tool
					: 'Anthropic (fallback)') +
				'\n  simple_chat -> ' +
				(ollamaAvailable
					? currentConfig.ollama.models.chat
					: 'Anthropic (fallback)') +
				'\n  complex_reasoning -> Anthropic (preferred)';
		}

		bus.emitAgent({
			type: 'thought',
			content: status
		});

		bus.emitAgent({ type: 'done', summary: 'Provider status displayed' });
	} catch (error) {
		bus.emitAgent({
			type: 'error',
			message: `Failed to get status: ${error instanceof Error ? error.message : String(error)}`
		});
	}
}

async function switchProvider(mode: string, currentConfig: any): Promise<void> {
	const validModes = ['anthropic', 'ollama', 'moe'];
	if (!validModes.includes(mode)) {
		bus.emitAgent({
			type: 'error',
			message: `Invalid mode: ${mode}. Must be one of: anthropic, ollama, moe`
		});
		return;
	}

	// Verify provider availability
	if (mode === 'ollama' || mode === 'moe') {
		try {
			const baseUrl = currentConfig.ollama?.baseUrl || 'http://localhost:11434';
			const response = await fetch(`${baseUrl}/api/tags`, {
				signal: AbortSignal.timeout(2000)
			});
			if (!response.ok) {
				throw new Error('Ollama not running');
			}
		} catch {
			bus.emitAgent({
				type: 'error',
				message:
					'Cannot use Ollama - service not running. Start with: ollama serve'
			});
			return;
		}
	}

	await config.save({
		...currentConfig,
		provider: mode
	});

	bus.emitAgent({
		type: 'done',
		summary: `Switched to ${mode.toUpperCase()} mode`
	});
}
