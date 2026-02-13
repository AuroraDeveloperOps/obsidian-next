/**
 * Setup Command - First-run onboarding and Ollama configuration
 *
 * /setup - Run interactive setup wizard
 * /setup ollama - Setup Ollama for offline mode
 */

import { bus } from '../core/bus.js';
import { config } from '../core/config.js';
import { CommandHandler } from '../core/commands.js';
import { keyManager } from '../core/keyManager.js';

export const setupCommand: CommandHandler = async (args) => {
	const subcommand = args[0];

	if (subcommand === 'ollama') {
		await setupOllama();
	} else {
		await runSetupWizard();
	}
};

async function runSetupWizard(): Promise<void> {
	bus.emitAgent({
		type: 'thought',
		content: `[Setup] Welcome to Obsidian Next!

Let's configure your environment:

1. API Key (Anthropic)
   - Required for Claude models
   - Run: /init

2. Ollama (Optional - Offline Mode)
   - Run local models without API
   - Run: /setup ollama

3. Provider Mode
   - anthropic: API-only (default)
   - ollama: Local-only
   - moe: Intelligent routing
   - Change with: /models

Ready to start? Run /init to configure your API key.`
	});

	bus.emitAgent({ type: 'done', summary: 'Setup wizard displayed' });
}

async function setupOllama(): Promise<void> {
	bus.emitAgent({
		type: 'thought',
		content: '[Setup] Checking Ollama installation...'
	});

	// Check if Ollama is installed
	try {
		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		try {
			await execAsync('which ollama');
		} catch {
			bus.emitAgent({
				type: 'error',
				message: `[Setup] Ollama not found. Install it first:

macOS:
  brew install ollama

Linux:
  curl -fsSL https://ollama.com/install.sh | sh

Then run: ollama serve`
			});
			return;
		}

		// Check if Ollama is running
		const cfg = await config.load();
		const baseUrl = (cfg as any).ollama?.baseUrl || 'http://localhost:11434';

		try {
			const response = await fetch(`${baseUrl}/api/tags`, {
				signal: AbortSignal.timeout(2000)
			});

			if (!response.ok) {
				throw new Error('Not running');
			}

			// Ollama is running - check models
			const data = await response.json();
			const installedModels = (data.models || []).map((m: any) => m.name);

			const recommendedModels = [
				{
					name: 'llama3.1:8b-instruct-q4_K_M',
					purpose: 'Tool Calling',
					size: '~4.7GB',
					reason: 'Best for function calling (2026 benchmark)'
				},
				{
					name: 'dolphin3:8b-llama3.1-q4_K_M',
					purpose: 'General Chat',
					size: '~4.7GB',
					reason: 'Coding, math, agents, general use'
				},
				{
					name: 'qwen3:14b-q4_K_M',
					purpose: 'Complex Reasoning',
					size: '~8.5GB',
					reason: 'Top-tier reasoning, rarely hallucinates'
				}
			];

			let output = `[Setup] Ollama is running!

Hardware recommendations:
  8GB RAM:  Use 8B models (llama3.1, dolphin3)
  16GB RAM: Use 14B models (qwen3)
  32GB RAM: Use 32B+ models for best quality

Recommended models for MoE:
`;

			for (const model of recommendedModels) {
				const installed = installedModels.includes(model.name);
				const status = installed ? '[INSTALLED]' : '[NOT INSTALLED]';
				output += `\n  ${status} ${model.name}
    Purpose: ${model.purpose}
    Size: ${model.size}
    Why: ${model.reason}
    Install: ollama pull ${model.name}\n`;
			}

			output += `\nQuick start (all 3 models):
  ollama pull llama3.1:8b-instruct-q4_K_M
  ollama pull dolphin3:8b-llama3.1-q4_K_M
  ollama pull qwen3:14b-q4_K_M

After installing, switch mode:
  /models moe

Advanced users can use custom models:
  /config edit ollama.models.tool
  /config edit ollama.models.chat
  /config edit ollama.models.reasoning`;

			bus.emitAgent({
				type: 'thought',
				content: output
			});

			bus.emitAgent({
				type: 'done',
				summary: 'Ollama setup guide displayed'
			});
		} catch {
			bus.emitAgent({
				type: 'error',
				message: `[Setup] Ollama is installed but not running.

Start it with:
  ollama serve

Then run this command again.`
			});
		}
	} catch (error) {
		bus.emitAgent({
			type: 'error',
			message: `[Setup] Failed: ${error instanceof Error ? error.message : String(error)}`
		});
	}
}
