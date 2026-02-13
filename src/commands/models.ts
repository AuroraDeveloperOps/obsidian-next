/**
 * Models Command - Model selection and provider management
 *
 * /models - Show model selection menu (Claude + Ollama + MoE)
 * /models <number|name> - Select model or mode
 * /models pull <name> - Download an Ollama model
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
	const debugLogs: string[] = [];

	// Fetch Ollama models
	let ollamaModels: any[] = [];
	let ollamaError: string | null = null;
	const baseUrl = currentConfig.ollama?.baseUrl || 'http://localhost:11434';

	debugLogs.push(`[Debug] Fetching Ollama models from ${baseUrl}...`);

	try {
		const response = await fetch(`${baseUrl}/api/tags`, {
			signal: AbortSignal.timeout(2000)
		});

		if (response.ok) {
			const data = await response.json();
			ollamaModels = data.models || [];
			debugLogs.push(`[Debug] Found ${ollamaModels.length} Ollama models`);
		} else {
			ollamaError = `Ollama response not OK: ${response.status}`;
			debugLogs.push(`[Debug] ${ollamaError}`);
		}
	} catch (e) {
		ollamaError = e instanceof Error ? e.message : String(e);
		debugLogs.push(`[Debug] Ollama fetch error: ${ollamaError}`);
	}

	const allModels = [
		...CLAUDE_4_MODELS.map(m => ({ ...m, provider: 'anthropic' })),
		...ollamaModels.map(m => ({ id: m.name, label: m.name, provider: 'ollama' })),
		{ id: 'moe', label: 'MoE (Intelligent Routing)', provider: 'moe' }
	];

	// Handle subcommands
	if (args.length > 0) {
		const subcommand = args[0].toLowerCase();

		switch (subcommand) {
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

			default:
				// Try to handle as model selection
				await selectModel(args[0], allModels, currentConfig);
				return;
		}
	}

	// Build Content
	const providerMode = (currentConfig as any).provider || 'anthropic';
	const output: string[] = [...debugLogs, ''];

	// Claude Section
	output.push('[MODELS - CLAUDE]');
	CLAUDE_4_MODELS.forEach((m, i) => {
		const isCurrent = providerMode === 'anthropic' && currentConfig.model === m.id;
		output.push(`   ${i + 1}. ${m.label.padEnd(30)} ${isCurrent ? '[Current]' : ''}`);
	});
	output.push('');

	// Ollama Section
	output.push('[MODELS - OLLAMA]');
	if (ollamaModels.length > 0) {
		const currentChat = currentConfig.ollama?.models?.chat || 'smollm:latest';
		ollamaModels.forEach((m: any, i: number) => {
			const name = m.name;
			const isCurrent = providerMode === 'ollama' && name === currentChat;
			output.push(`   ${CLAUDE_4_MODELS.length + i + 1}. ${name.padEnd(30)} ${isCurrent ? '[Current]' : ''}`);
		});
	} else if (ollamaError) {
		output.push(`   Error: ${ollamaError}`);
	} else {
		output.push('   No local models found. Pull with: /models pull <name>');
	}
	output.push('');

	// Special Modes
	output.push('[SPECIAL MODES]');
	const moeIdx = CLAUDE_4_MODELS.length + ollamaModels.length + 1;
	output.push(`   ${moeIdx}. MoE (Intelligent Routing)   ${providerMode === 'moe' ? '[Current]' : ''}`);
	output.push('');

	// Footer
	output.push(`[PROVIDER MODE: ${providerMode.toUpperCase()}]`);
	output.push(`   ⎿  /models <1-${allModels.length}|name>   Select model or mode`);
	output.push('   ⎿  /models pull <model>    Download Ollama model');

	bus.emitAgent({
		type: 'thought',
		content: output.join('\n')
	});

	bus.emitAgent({
		type: 'done',
		summary: `Found ${allModels.length} available models/modes`
	});
};


async function selectModel(
	selection: string,
	allModels: any[],
	currentConfig: any
): Promise<void> {
	const sel = selection.toLowerCase();
	let selectedModel: any;

	// Check if selection is a number
	const index = parseInt(sel);
	if (!isNaN(index) && index > 0 && index <= allModels.length) {
		selectedModel = allModels[index - 1];
	} else {
		// Try to match by name/id
		selectedModel = allModels.find(m => 
			m.id.toLowerCase().includes(sel) || 
			m.label.toLowerCase().includes(sel)
		);
	}

	if (!selectedModel) {
		bus.emitAgent({
			type: 'error',
			message: `Invalid selection: ${selection}. Choose a number (1-${allModels.length}) or model name.`
		});
		return;
	}

	const newConfig = { ...currentConfig };
	
	if (selectedModel.provider === 'anthropic') {
		newConfig.provider = 'anthropic';
		newConfig.model = selectedModel.id;
	} else if (selectedModel.provider === 'ollama') {
		newConfig.provider = 'ollama';
		newConfig.ollama = {
			...currentConfig.ollama,
			models: {
				...(currentConfig.ollama?.models || {}),
				chat: selectedModel.id,
				// Also set tool model if it's likely to support it or if none set
				tool: currentConfig.ollama?.models?.tool || selectedModel.id
			}
		};
	} else if (selectedModel.provider === 'moe') {
		newConfig.provider = 'moe';
	}

	await config.save(newConfig);

	bus.emitAgent({
		type: 'done',
		summary: `Switched to ${selectedModel.provider} mode${selectedModel.provider !== 'moe' ? ` with model ${selectedModel.id}` : ''}`
	});
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

