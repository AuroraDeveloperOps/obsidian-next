/**
 * Model Router
 *
 * Intelligently routes requests to the appropriate model provider
 * Implements Mixture of Experts (MoE) pattern for offline operation
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ModelProvider } from './providers/provider.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OllamaProvider } from './providers/ollama.js';
import { config } from './config.js';
import { bus } from './bus.js';

type ProviderMode = 'anthropic' | 'ollama' | 'moe';

interface RouterConfig {
	mode: ProviderMode;
	ollama: {
		baseUrl: string;
		models: {
			tool: string;
			chat: string;
			reasoning: string;
		};
	};
	anthropicModel: string;
}

type TaskType = 'tool_calling' | 'simple_chat' | 'complex_reasoning';

export class ModelRouter {
	private anthropicProvider: AnthropicProvider;
	private ollamaProvider: OllamaProvider;
	private config: RouterConfig | null = null;

	constructor() {
		this.anthropicProvider = new AnthropicProvider();
		this.ollamaProvider = new OllamaProvider();
	}

	async initialize(): Promise<void> {
		const cfg = await config.load();

		this.config = {
			mode: (cfg as any).provider || 'anthropic',
			ollama: (cfg as any).ollama || {
				baseUrl: 'http://localhost:11434',
				models: {
					tool: 'functiongemma:latest',
					chat: 'smollm:latest',
					reasoning: 'smollm:latest'
				}
			},
			anthropicModel: cfg.model
		};

		// Initialize providers
		this.anthropicProvider.setModel(this.config.anthropicModel);
		this.ollamaProvider = new OllamaProvider(
			this.config.ollama.baseUrl,
			this.config.ollama.models.chat
		);
	}

	/**
	 * Route a request to the appropriate provider
	 */
	async route(messages: Anthropic.MessageParam[]): Promise<ModelProvider> {
		if (!this.config) {
			await this.initialize();
		}

		const mode = this.config!.mode;

		// Mode 1: Pure Anthropic
		if (mode === 'anthropic') {
			return this.anthropicProvider;
		}

		// Mode 2: Pure Ollama
		if (mode === 'ollama') {
			const available = await this.ollamaProvider.isAvailable();
			if (!available) {
				bus.emitAgent({
					type: 'thought',
					content: '[Router] Ollama unavailable, falling back to Anthropic',
					hidden: true
				});
				return this.anthropicProvider;
			}

			// Use chat model by default
			const model = await this.selectBestOllamaModel(this.config!.ollama.models.chat);
			if (model) {
				this.ollamaProvider.setModel(model);
				return this.ollamaProvider;
			}
			
			// Fallback if no models available
			return this.anthropicProvider;
		}

		// Mode 3: MoE - Intelligent routing
		const taskType = this.classifyTask(messages);

		switch (taskType) {
			case 'tool_calling': {
				// Prefer FuncGemma for tool calling
				const available = await this.ollamaProvider.isAvailable();
				if (available) {
					const model = await this.selectBestOllamaModel(this.config!.ollama.models.tool);
					if (model) {
						this.ollamaProvider.setModel(model);
						bus.emitAgent({
							type: 'thought',
							content: `[MoE] Routing to ${model} for tool execution`,
							hidden: true
						});
						return this.ollamaProvider;
					}
				}

				// Fallback to Anthropic
				bus.emitAgent({
					type: 'thought',
					content: '[MoE] Ollama unavailable, using Anthropic for tools',
					hidden: true
				});
				return this.anthropicProvider;
			}

			case 'simple_chat': {
				// Use SmolLM for simple chat
				const available = await this.ollamaProvider.isAvailable();
				if (available) {
					const model = await this.selectBestOllamaModel(this.config!.ollama.models.chat);
					if (model) {
						this.ollamaProvider.setModel(model);
						bus.emitAgent({
							type: 'thought',
							content: `[MoE] Routing to ${model} for chat`,
							hidden: true
						});
						return this.ollamaProvider;
					}
				}

				// Fallback to Anthropic
				return this.anthropicProvider;
			}

			case 'complex_reasoning': {
				// Prefer Anthropic for complex reasoning
				const anthropicAvailable = await this.anthropicProvider.isAvailable();
				if (anthropicAvailable) {
					bus.emitAgent({
						type: 'thought',
						content: '[MoE] Routing to Claude for complex reasoning',
						hidden: true
					});
					return this.anthropicProvider;
				}

				// Fallback to Ollama reasoning model
				const ollamaAvailable = await this.ollamaProvider.isAvailable();
				if (ollamaAvailable) {
					const model = await this.selectBestOllamaModel(this.config!.ollama.models.reasoning);
					if (model) {
						this.ollamaProvider.setModel(model);
						bus.emitAgent({
							type: 'thought',
							content: `[MoE] Claude unavailable, using ${model}`,
							hidden: true
						});
						return this.ollamaProvider;
					}
				}

				throw new Error('No providers available');
			}

			default:
				return this.anthropicProvider;
		}
	}

	/**
	 * Select best available Ollama model based on preference
	 */
	private async selectBestOllamaModel(preferred: string): Promise<string | null> {
		try {
			const models = await this.ollamaProvider.listModels();
			if (models.length === 0) return null;

			// 1. Exact match
			if (models.includes(preferred)) {
				return preferred;
			}

			// 2. Match without tag (e.g., 'smollm:latest' -> match 'smollm:135m')
			const preferredBase = preferred.split(':')[0];
			const familyMatch = models.find(m => m.startsWith(preferredBase));
			if (familyMatch) {
				bus.emitAgent({
					type: 'thought',
					content: `[Router] Model ${preferred} not found, using ${familyMatch}`,
					hidden: true
				});
				return familyMatch;
			}

			// 3. Fallback to any model if configured one is missing
			// This is safer than failing, but might yield unexpected results.
			// Ideally we shouldn't do this for tool calling unless we know the model supports it.
			// For now, let's just pick the first one and hope for the best, or return null to trigger fallback?
			// The router logic has fallbacks to Anthropic, so returning null is better if we can't match intent.
			
			// However, in 'ollama' mode (forced), we might want *any* model rather than falling back to Anthropic (which might not be configured/paid).
			if (this.config?.mode === 'ollama') {
				const fallback = models[0];
				bus.emitAgent({
					type: 'thought',
					content: `[Router] Model ${preferred} not found, falling back to ${fallback}`,
					hidden: true
				});
				return fallback;
			}

			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Classify task type based on conversation history
	 */
	public classifyTask(messages: Anthropic.MessageParam[]): TaskType {
		if (messages.length === 0) return 'simple_chat';

		// Check for tool use in recent history (last 3 messages)
		const recentMessages = messages.slice(-3);
		const hasToolActivity = recentMessages.some((msg) => {
			if (Array.isArray(msg.content)) {
				return msg.content.some(
					(block: any) =>
						block.type === 'tool_use' || block.type === 'tool_result'
				);
			}
			return false;
		});

		if (hasToolActivity) {
			return 'tool_calling';
		}

		// Get last user message
		const lastUserMessage = messages
			.slice()
			.reverse()
			.find((m) => m.role === 'user');

		if (!lastUserMessage) return 'simple_chat';

		const content =
			typeof lastUserMessage.content === 'string'
				? lastUserMessage.content
				: Array.isArray(lastUserMessage.content)
					? lastUserMessage.content
							.filter((b: any) => b.type === 'text')
							.map((b: any) => b.text)
							.join(' ')
					: '';

		// Check for complexity indicators
		const complexityIndicators = [
			/explain.*architecture/i,
			/analyze.*codebase/i,
			/design.*system/i,
			/implement.*feature/i,
			/refactor/i,
			/optimize/i,
			/debug.*complex/i,
			/plan.*implementation/i,
			/strategy/i,
			/approach/i
		];

		const isComplex = complexityIndicators.some((pattern) =>
			pattern.test(content)
		);
		if (isComplex) {
			return 'complex_reasoning';
		}

		// Check message length (>500 chars suggests complex query)
		if (content.length > 500) {
			return 'complex_reasoning';
		}

		// Check for multi-step questions
		const hasMultipleQuestions = (content.match(/\?/g) || []).length > 1;
		if (hasMultipleQuestions) {
			return 'complex_reasoning';
		}

		return 'simple_chat';
	}

	/**
	 * Get current provider mode
	 */
	getMode(): ProviderMode {
		return this.config?.mode || 'anthropic';
	}

	/**
	 * Set provider mode
	 */
	async setMode(mode: ProviderMode): Promise<void> {
		const cfg = await config.load();
		await config.save({ ...cfg, provider: mode } as any);
		await this.initialize();
	}

	/**
	 * Get provider instance by name
	 */
	getProvider(name: 'anthropic' | 'ollama'): ModelProvider {
		return name === 'anthropic' ? this.anthropicProvider : this.ollamaProvider;
	}

	/**
	 * Check provider availability
	 */
	async checkProviders(): Promise<{
		anthropic: boolean;
		ollama: boolean;
	}> {
		const [anthropic, ollama] = await Promise.all([
			this.anthropicProvider.isAvailable(),
			this.ollamaProvider.isAvailable()
		]);

		return { anthropic, ollama };
	}
}

export const router = new ModelRouter();
