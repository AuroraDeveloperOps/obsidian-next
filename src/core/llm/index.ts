import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { bus } from '../bus.js';
import { usage } from '../usage.js';
import { tools } from '../../tools/index.js';
import { redactor } from '../redactor.js';
import { keyManager, detectEnvFile } from '../keyManager.js';
import { mcp } from '../mcp.js';
import { listRegistry } from '../mcp-registry.js';
import { router } from '../router.js';
import {
	calculateScaleForAPI,
	getDisplayDimensions,
	takeScreenshotForAPI
} from '../../computer/screenshot.js';
import { getToolConfig } from '../../computer/client.js';

const MAX_TOOL_ITERATIONS = 67;

// Computer Use State
interface ComputerUseState {
	enabled: boolean;
	displayWidth: number;
	displayHeight: number;
	scale: number;
	scaledWidth: number;
	scaledHeight: number;
}

// Context Management Constants
const CONTEXT = {
	MAX_MESSAGES: 40,
	KEEP_FIRST: 2,
	KEEP_LAST: 15,
	BUFFER: 5,
	TOKEN_LIMIT_WARN: 0.8,
	TOKEN_LIMIT_PRUNE: 0.9,
	TOKEN_LIMIT_STOP: 0.98,
	MAX_TOKENS_TOTAL: 200_000
};

interface ToolUsePartial {
	id: string;
	name: string;
	input: string | Record<string, unknown>;
}

/** Helper type for Anthropic message content blocks used in history management */
type ContentBlock = { type: string; [key: string]: unknown };

export class LLMClient {
	private client: Anthropic | null = null;
	private lastConfig: Awaited<ReturnType<typeof config.load>> | null = null;
	private conversationHistory: Anthropic.MessageParam[] = [];
	private toolIterations = 0;
	private accumulatedInputTokens = 0;
	private accumulatedOutputTokens = 0;
	private accumulatedCacheReadTokens = 0;
	private accumulatedCacheCreationTokens = 0;
	private abortController: AbortController | null = null;
	private currentInterruptHandler: ((e: { type: string }) => void) | null =
		null;
	private lastToolOutputs: string[] = [];

	constructor() {
		// Listen for computer scale updates from screenshot tool
		bus.on(
			'agent',
			(event: {
				type: string;
				scale?: number;
				scaledWidth?: number;
				scaledHeight?: number;
				nativeWidth?: number;
				nativeHeight?: number;
			}) => {
				if (
					event.type === 'computer_scale_update' &&
					this.computerUseState.enabled
				) {
					this.computerUseState.scale =
						event.scale ?? this.computerUseState.scale;
					this.computerUseState.scaledWidth =
						event.scaledWidth ?? this.computerUseState.scaledWidth;
					this.computerUseState.scaledHeight =
						event.scaledHeight ?? this.computerUseState.scaledHeight;
					this.computerUseState.displayWidth =
						event.nativeWidth ?? this.computerUseState.displayWidth;
					this.computerUseState.displayHeight =
						event.nativeHeight ?? this.computerUseState.displayHeight;
				}
			}
		);
	}

	// Computer Use State - proper Anthropic API integration
	private computerUseState: ComputerUseState = {
		enabled: false,
		displayWidth: 1920,
		displayHeight: 1080,
		scale: 1.0,
		scaledWidth: 1920,
		scaledHeight: 1080
	};

	async initialize() {
		const cfg = await config.load();
		await usage.init();

		// Check for .env file and warn user (we no longer auto-load .env)
		const envFileCheck = await detectEnvFile(cfg.workspaceRoot);
		if (envFileCheck.found) {
			bus.emitAgent({
				type: 'thought',
				content: `[WARN] Found .env file with API key at ${envFileCheck.path}. For security, run /init to migrate to secure storage.`,
				hidden: false
			});
		}

		// Check for deprecated apiKey in config and offer migration
		if (config.hasDeprecatedKey()) {
			const deprecatedKey = config.getDeprecatedApiKey();
			if (deprecatedKey) {
				bus.emitAgent({
					type: 'thought',
					content:
						'[WARN] Found API key in config file. Migrating to secure storage...',
					hidden: false
				});

				// Migrate to KeyManager
				const result = await keyManager.storeKey(deprecatedKey);
				if (result.success) {
					await config.removeApiKeyFromConfig();
					bus.emitAgent({
						type: 'thought',
						content: `[INFO] API key migrated to ${result.backend}. Config file cleaned.`,
						hidden: false
					});
				}
			}
		}

		// Auto-save history on init? No, restore handles that.

		// Load API key exclusively via KeyManager
		// Supports: environment variable, macOS keychain, Linux secret-tool, encrypted file
		const apiKey = await keyManager.loadKey();

		if (!apiKey) {
			bus.emitAgent({
				type: 'error',
				message:
					'Missing API key. Run /init to set up secure key storage, or set ANTHROPIC_API_KEY environment variable.'
			});
			return false;
		}

		this.client = new Anthropic({
			apiKey: apiKey
		});
		this.lastConfig = cfg;

		// Log which backend is being used (for debugging)
		const backend = keyManager.getBackend();
		if (backend && backend !== 'env') {
			bus.emitAgent({
				type: 'thought',
				content: `[INFO] API key loaded from: ${backend}`,
				hidden: true
			});
		}

		return true;
	}

	/**
	 * Refresh the API client if key has rotated
	 */
	async refreshIfNeeded(): Promise<boolean> {
		if (keyManager.shouldRotate()) {
			const newKey = await keyManager.refreshKey();
			if (newKey) {
				this.client = new Anthropic({ apiKey: newKey });
				return true;
			}
		}
		return false;
	}

	/**
	 * Count tokens for a potential message before sending
	 * Uses Anthropic's countTokens API for accurate estimation
	 * Returns null on failure (caller should fall back to heuristic)
	 */
	async countTokens(
		systemPrompt: Anthropic.TextBlockParam[],
		messages: Anthropic.MessageParam[],
		tools?: Anthropic.Tool[]
	): Promise<number | null> {
		if (!this.client) return null;

		try {
			// Apply same model mapping as streamChat to handle aliases
			const modelMap: Record<string, string> = {
				'claude-opus-4-6': 'claude-opus-4-6-20260207',
				'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
				'claude-haiku-4-5': 'claude-haiku-4-5-20251001'
			};
			const requestedModel =
				this.lastConfig?.model || 'claude-opus-4-6-20260207';
			const model = modelMap[requestedModel] || requestedModel;

			const response = await this.client.messages.countTokens({
				model,
				system: systemPrompt,
				messages,
				tools
			});
			return response.input_tokens;
		} catch (error) {
			// Fail silently - caller will fall back to heuristic estimation
			bus.emitAgent({
				type: 'thought',
				content: '[Context] Token count API unavailable, using heuristic.',
				hidden: true
			});
			return null;
		}
	}

	/**
	 * Enable Computer Use mode with proper Anthropic beta API
	 * This activates:
	 * - Beta header (computer-use-2025-01-24 or computer-use-2025-11-24)
	 * - Anthropic-defined schema-less tools
	 * - Coordinate scaling for high-res displays
	 */
	async enableComputerUse(): Promise<void> {
		const dims = await getDisplayDimensions();
		const scale = calculateScaleForAPI(dims.width, dims.height);

		this.computerUseState = {
			enabled: true,
			displayWidth: dims.width,
			displayHeight: dims.height,
			scale,
			scaledWidth: Math.floor(dims.width * scale),
			scaledHeight: Math.floor(dims.height * scale)
		};

		bus.emitAgent({
			type: 'thought',
			content: `[Computer Use] Enabled. Display: ${dims.width}x${dims.height}, API Scale: ${scale.toFixed(3)} -> ${this.computerUseState.scaledWidth}x${this.computerUseState.scaledHeight}`,
			hidden: false
		});
	}

	/**
	 * Disable Computer Use mode
	 */
	disableComputerUse(): void {
		this.computerUseState.enabled = false;
		bus.emitAgent({
			type: 'thought',
			content: '[Computer Use] Disabled.',
			hidden: false
		});
	}

	/**
	 * Check if Computer Use mode is enabled
	 */
	isComputerUseEnabled(): boolean {
		return this.computerUseState.enabled;
	}

	/**
	 * Update the scale factor (called after screenshot to ensure accuracy)
	 */
	updateComputerScale(
		actualScale: number,
		scaledWidth: number,
		scaledHeight: number
	): void {
		if (this.computerUseState.enabled && actualScale > 0) {
			this.computerUseState.scale = actualScale;
			this.computerUseState.scaledWidth = scaledWidth;
			this.computerUseState.scaledHeight = scaledHeight;
			// Calculate native dimensions from scaled dimensions
			this.computerUseState.displayWidth = Math.round(
				scaledWidth / actualScale
			);
			this.computerUseState.displayHeight = Math.round(
				scaledHeight / actualScale
			);
		}
	}

	/**
	 * Prune old images from conversation history to prevent context explosion
	 * Keeps only the most recent N images, replacing older ones with text placeholders
	 */
	private pruneImagesFromHistory(keepCount: number): void {
		// Find all image blocks in history (newest first)
		const imageLocations: { msgIdx: number; blockIdx: number }[] = [];

		for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
			const msg = this.conversationHistory[i];
			if (Array.isArray(msg.content)) {
				for (
					let j = (msg.content as unknown as ContentBlock[]).length - 1;
					j >= 0;
					j--
				) {
					const block = (msg.content as unknown as ContentBlock[])[j];
					if (
						block.type === 'image' ||
						(block.type === 'tool_result' && Array.isArray(block.content))
					) {
						// Check for images in tool_result content
						if (block.type === 'tool_result' && Array.isArray(block.content)) {
							for (let k = block.content.length - 1; k >= 0; k--) {
								if (block.content[k].type === 'image') {
									imageLocations.push({ msgIdx: i, blockIdx: j });
									break; // One per tool_result
								}
							}
						} else if (block.type === 'image') {
							imageLocations.push({ msgIdx: i, blockIdx: j });
						}
					}
				}
			}
		}

		// Remove images beyond keepCount (oldest first, so skip the first keepCount)
		const toRemove = imageLocations.slice(keepCount);

		for (const loc of toRemove) {
			const msg = this.conversationHistory[loc.msgIdx];
			if (Array.isArray(msg.content)) {
				const block = (msg.content as unknown as ContentBlock[])[loc.blockIdx];

				if (block.type === 'tool_result' && Array.isArray(block.content)) {
					// Replace images in tool_result with placeholder
					block.content = (block.content as ContentBlock[]).map(
						(c: ContentBlock) =>
							c.type === 'image'
								? {
										type: 'text',
										text: '[Previous screenshot removed to save context]'
									}
								: c
					);
				} else if (block.type === 'image') {
					// Replace standalone image
					(msg.content as unknown as ContentBlock[])[loc.blockIdx] = {
						type: 'text',
						text: '[Previous screenshot removed to save context]'
					};
				}
			}
		}

		if (toRemove.length > 0) {
			bus.emitAgent({
				type: 'thought',
				content: `[Context] Pruned ${toRemove.length} old screenshot(s) to save context.`,
				hidden: true
			});
		}
	}

	/**
	 * Build the core system prompt to ensure identical persona across models
	 */
	private async buildSystemPrompt(options?: {
		omitTools?: boolean;
		taskType?: string;
		tokensUsed?: number;
		tokenBudget?: number;
	}): Promise<string> {
		const cfg = await config.load();
		const currentMode = (await import('../context.js')).context.getMode();

		// Load user context from memory
		let userContext = '';
		try {
			const { memory } = await import('../memory.js');
			userContext = await memory.getUserContext();
		} catch (e) {}

		// Define tool awareness
		const toolsList = '';
		if (options?.omitTools) {
			const shortPrompt = `You are Obsidian, a blunt CLI tool.
Rules:
- NO Markdown. Plain text only.
- NO chatter. NO "I am an AI".
- Be direct, short, and blunt.
- CWD: ${cfg.workspaceRoot}
Mode: ${currentMode.toUpperCase()}`;
			
			if (options?.tokensUsed !== undefined && options?.tokenBudget !== undefined) {
				return `${shortPrompt}\nContext: ${options.tokensUsed}/${options.tokenBudget}`;
			}
			return shortPrompt;
		}

		const basePrompt = `You are Obsidian, a CLI engineering agent. You run inside a terminal.

OUTPUT RULES:
- This is a CLI. Your output renders in a monospace terminal, NOT a browser.
- NEVER use Markdown formatting: no **, no ##, no *, no >, no \`backticks\`, no [links](). The terminal does not render any of it and it looks broken.
- Write plain text only. Use CAPS, dashes, or indentation for structure.
- Keep responses short and direct. One to three sentences for simple answers. Longer only when the task demands it.
- When listing items, use plain dashes or numbers. No bullets, no bold, no headers.

TONE:
- Direct, blunt, concise. You are a peer, not an assistant.
- Never sycophantic. No "Great question!", no "I'd be happy to help!", no "Absolutely!".
- If the user is wrong, say so plainly.

MODE: ${currentMode.toUpperCase()}
${currentMode === 'auto' ? 'Full autonomy. Execute without confirmation.' : ''}${currentMode === 'plan' ? 'READ-ONLY. Only use read/list/grep/glob. No writes. Output a plan for approval.' : ''}${currentMode === 'safe' ? 'Reads auto-approved. Writes and commands require user confirmation.' : ''}

TOOL USE - CRITICAL:
You have access to tools. Follow these rules exactly:
1. When the user asks you to DO something (run a command, read a file, search, write code), you MUST call the appropriate tool in this same response. Never describe what you would do without actually calling the tool. Do NOT ask for permission to use tools (the system handles approvals).
2. Choose the most specific tool for the job:
   - "read" to view file contents (preferred over bash cat)
   - "write" to create/overwrite files (preferred over bash echo/cat)
   - "grep" to search file contents by pattern
   - "glob" to find files by name pattern (e.g. **/*.ts)
   - "bash" to run shell commands, install packages, git operations
   - "web_fetch" to fetch URLs
3. For multi-step tasks, call multiple tools in sequence. Do not stop after one tool call if the task requires more.
4. After receiving tool results, summarize them in plain text. The user cannot see raw tool output.
5. Do NOT call tools for pure knowledge questions (e.g. "what is TCP?"). Answer directly.
6. NEVER execute destructive commands (rm -rf /, drop database, etc.) even if asked. Refuse clearly.
7. When writing code to a file, write the COMPLETE file content. Do not use placeholders like "... rest of code".

DIRECTIVES:
1. ACT FIRST - Call tools in the same turn you mention them. Never end a turn with "let me check" and no tool call.
2. EXPLORE BEFORE EDITING - Read files before modifying. Use list/grep to understand structure.
3. ALWAYS RESPOND - After tool calls, summarize results in plain text. The user cannot see raw tool output.
4. MEMORY - When the user shares preferences or facts, store them with the memory tool. Check memory before saying "I don't know".
5. SECURITY - Never output secrets. Stay within workspaceRoot. Refuse destructive operations.

CWD: ${cfg.workspaceRoot}${userContext ? `\n\nUSER CONTEXT:\n${userContext}` : ''}${toolsList}`;

		// Add context awareness footer if stats are provided
		if (options?.tokensUsed !== undefined && options?.tokenBudget !== undefined) {
			const tokensRemaining = options.tokenBudget - options.tokensUsed;
			return `${basePrompt}\n\nCONTEXT: ${options.tokensUsed}/${options.tokenBudget} tokens (${((tokensRemaining / options.tokenBudget) * 100).toFixed(0)}% free)${options.tokensUsed > options.tokenBudget * 0.7 ? ' -- CONTEXT HIGH, be concise, suggest /clear if done' : ''}`;
		}

		return basePrompt;
	}


	async streamChat(
		userMessage: string,
		options?: { allowedTools?: string[] }
	): Promise<string | null> {
		if (!this.client) {
			const initialized = await this.initialize();
			if (!initialized || !this.client) return null;
		}

		// Check provider mode and route accordingly
		const cfg = await config.load();
		const providerMode = (cfg as any).provider || 'anthropic';

		// For ollama/moe modes, delegate to provider-based streaming
		if (providerMode === 'ollama' || providerMode === 'moe') {
			return await this.streamChatViaProvider(userMessage, options);
		}

		// Default: use Anthropic client (existing behavior)
		try {
			const modelMap: Record<string, string> = {
				// New 4.6 / 4.5 Aliases
				'claude-opus-4-6': 'claude-opus-4-6-20260207',
				'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
				'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
				'claude-opus-4-5': 'claude-opus-4-5-20251101',
				ollama: 'llama3'
			};

			// Use mapped ID or raw config string. Default to Opus 4.6.
			const requestedModel =
				this.lastConfig?.model || 'claude-opus-4-6-20260207';
			const apiModel = modelMap[requestedModel] || requestedModel;

			// 200k Token Safety Strategy (Two-phase validation)
			// Phase 1: Fast heuristic check (before building full request)
			// Phase 2: Accurate API-based count (after building request, if preCountTokens enabled)
			const currentUsage = Math.max(
				this.accumulatedInputTokens,
				usage.getContextUsage(apiModel).used
			); // Heuristic

			if (currentUsage > CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_STOP) {
				bus.emitAgent({
					type: 'error',
					message: `[SAFETY] Context limit reached (${(currentUsage / 1000).toFixed(1)}k). Please run /clear to reset.`
				});
				return null;
			}

			if (currentUsage > CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_PRUNE) {
				bus.emitAgent({
					type: 'thought',
					content: `[SAFETY] CRITICAL CONTEXT LEVEL (${(currentUsage / 1000).toFixed(1)}k). Aggressive pruning engaged.`
				});
				await this.compressHistory(); // Trigger pruning
			} else if (
				currentUsage >
				CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_WARN
			) {
				bus.emitAgent({
					type: 'thought',
					content: `[WARN] High context usage (${(currentUsage / 1000).toFixed(1)}k). Consider resetting soon.`
				});
			}

			if (userMessage.trim()) {
				// New user message - reset iteration counter and token accumulators
				this.toolIterations = 0;
				this.lastToolOutputs = [];
				// Note: We do NOT reset accumulatedInputTokens here blindly if we want to track session growth,
				// BUT for a new turn, we usually rely on the API to give us the fresh count.
				// The `accumulatedInputTokens` property in this class is somewhat transient for the current streaming loop.
				// `usage` module handles the persistent tracking.
				this.accumulatedInputTokens = 0;
				this.accumulatedOutputTokens = 0;
				this.accumulatedCacheReadTokens = 0;
				this.accumulatedCacheCreationTokens = 0;

				this.conversationHistory.push({
					role: 'user',
					content: userMessage
				});
			} else {
				// Tool continuation - check iteration limit
				this.toolIterations++;
				if (this.toolIterations > MAX_TOOL_ITERATIONS) {
					bus.emitAgent({
						type: 'error',
						message: `Tool iteration limit (${MAX_TOOL_ITERATIONS}) exceeded. Stopping to prevent infinite loop.`
					});
					return null;
				}
			}

			// Define available tools for Claude
			const availableTools = await tools.list();

			// Build tool definitions - handle computer use specially when enabled
			let toolDefinitionsForApi: any[] = [];
			const computerUseToolsForApi: any[] = [];
			let usesBetaApi = false;

			if (this.computerUseState.enabled) {
				// Computer Use Mode: Use Anthropic-defined schema-less tools
				const { toolVersion, betaFlag } = getToolConfig(apiModel);
				usesBetaApi = true;

				// Add Anthropic-defined computer tool (schema-less)
				computerUseToolsForApi.push({
					type: toolVersion,
					name: 'computer',
					display_width_px: this.computerUseState.scaledWidth,
					display_height_px: this.computerUseState.scaledHeight,
					display_number: 1,
					// Enable zoom for Opus 4.5
					...(toolVersion === 'computer_20251124' ? { enable_zoom: true } : {})
				});

				// Add Anthropic-defined text editor tool
				computerUseToolsForApi.push({
					type: 'text_editor_20250728',
					name: 'str_replace_based_edit_tool'
				});

				// Add Anthropic-defined bash tool
				computerUseToolsForApi.push({
					type: 'bash_20250124',
					name: 'bash'
				});

				// Filter out tools that conflict with Anthropic-defined tools
				// - 'computer' -> replaced by Anthropic computer tool
				// - 'bash' -> replaced by Anthropic bash tool
				// - 'edit', 'read', 'write' are kept as they complement str_replace_based_edit_tool
				const conflictingTools = ['computer', 'bash'];
				const filteredTools = availableTools.filter(
					(t) => !conflictingTools.includes(t.name)
				);

				toolDefinitionsForApi = filteredTools.map((tool) => ({
					name: tool.name,
					description: tool.description,
					input_schema: {
						type: 'object',
						properties: tool.inputSchema,
						required: tool.requiredParams
					}
				}));
			} else {
				// Standard mode: Use regular tool format
				toolDefinitionsForApi = availableTools.map((tool) => ({
					name: tool.name,
					description: tool.description,
					input_schema: {
						type: 'object',
						properties: tool.inputSchema,
						required: tool.requiredParams
					}
				}));
			}

			// Combine all tools (Anthropic-defined first, then custom)
			const allToolsForApi = [
				...computerUseToolsForApi,
				...toolDefinitionsForApi
			];

			if (options?.allowedTools) {
				// Filter but keep Anthropic-defined tools
				const filtered = allToolsForApi.filter(
					(t) => t.type || options.allowedTools!.includes(t.name)
				);
				toolDefinitionsForApi = filtered;
			} else {
				toolDefinitionsForApi = allToolsForApi;
			}

			// Categorize MCP Capabilities for Perfect Awareness
			const mcpStatus = mcp.getStatus();
			const activeServers = mcpStatus
				.filter((s) => s.connected)
				.map((s) => s.name);
			const offlineServers = mcpStatus
				.filter((s) => !s.connected)
				.map((s) => s.name);
			const registry = listRegistry();
			const installableServers = registry.filter(
				(r) => !mcpStatus.find((s) => s.name === r.name)
			);

			const activeList = availableTools
				.map((t) => `- ${t.name}: ${t.description}`)
				.join('\n');
			const offlineList = offlineServers
				.map((n) => {
					const def = registry.find((r) => r.name === n);
					return `- ${n}: ${def?.description || 'Configured server'} (run 'mcp_manage connect ${n}' to use)`;
				})
				.join('\n');
			const registryList = installableServers
				.map(
					(r) =>
						`- ${r.name}: ${r.description} (run 'mcp_manage install ${r.name}')`
				)
				.join('\n');

			// Prune history if too large (Context Editing)
			await this.compressHistory();

			// Load user context from memory for personalization
			let userContext = '';
			let memoryAvailable = true;
			try {
				const { memory } = await import('../memory.js');
				userContext = await memory.getUserContext();
			} catch (e) {
				memoryAvailable = false;
				bus.emitAgent({
					type: 'thought',
					content:
						'[WARN] Memory system unavailable. Personalization disabled.',
					hidden: true
				});
			}

			// Cache Control Strategy:
			// 1. System Prompt (static, huge) - Always cached
			// 2. Tool Definitions (static, huge) - Always cached
			// 3. Last user turn (checkpoint) - Cached every 5 turns

			// Get current mode and context stats for awareness
			// Construct System Prompt with Caching
			const systemPromptText = await this.buildSystemPrompt();
			const ctxUsage = usage.getContextUsage(apiModel);
			const tokenBudget = CONTEXT.MAX_TOKENS_TOTAL;
			const tokensUsed = ctxUsage.used;
			const tokensRemaining = tokenBudget - tokensUsed;

			const systemPromptBlock: Anthropic.TextBlockParam = {
				type: 'text',
				text: `${systemPromptText}\n\nCONTEXT: ${tokensUsed}/${tokenBudget} tokens (${((tokensRemaining / tokenBudget) * 100).toFixed(0)}% free)${tokensUsed > tokenBudget * 0.7 ? ' -- CONTEXT HIGH, be concise, suggest /clear if done' : ''}`,
				cache_control: { type: 'ephemeral' }
			};

			// Pre-validate context budget with accurate token count (if enabled)
			if (this.lastConfig?.preCountTokens !== false) {
				const preRequestTokens = await this.countTokens(
					[systemPromptBlock],
					this.conversationHistory,
					toolDefinitionsForApi as Anthropic.Tool[]
				);

				if (preRequestTokens !== null) {
					// Update usage tracking with accurate count
					const accurateUsage = preRequestTokens;

					if (
						accurateUsage >
						CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_STOP
					) {
						bus.emitAgent({
							type: 'error',
							message: `[Context] Message would use ${(accurateUsage / 1000).toFixed(1)}k tokens (limit: ${((CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_STOP) / 1000).toFixed(0)}k). Run /clear or auto-pruning.`
						});
						// Auto-prune and retry
						await this.compressHistory();
						return await this.streamChat(userMessage, options);
					}

					if (
						accurateUsage >
						CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_PRUNE
					) {
						bus.emitAgent({
							type: 'thought',
							content: `[Context] Pre-check: ${(accurateUsage / 1000).toFixed(1)}k tokens (${((accurateUsage / CONTEXT.MAX_TOKENS_TOTAL) * 100).toFixed(0)}%). Pruning before send.`,
							hidden: false
						});
						await this.compressHistory();
					} else if (
						accurateUsage >
						CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_WARN
					) {
						bus.emitAgent({
							type: 'thought',
							content: `[Context] Pre-check: ${(accurateUsage / 1000).toFixed(1)}k tokens (${((accurateUsage / CONTEXT.MAX_TOKENS_TOTAL) * 100).toFixed(0)}%). Consider /clear soon.`,
							hidden: true
						});
					}
				}
			}

			this.abortController = new AbortController();
			const signal = this.abortController.signal;

			// Clean up any existing interrupt handler before creating new one
			if (this.currentInterruptHandler) {
				bus.off('user', this.currentInterruptHandler);
			}

			this.currentInterruptHandler = (e: { type: string }) => {
				if (e.type === 'user_interrupt' && this.abortController) {
					this.abortController.abort();
					bus.emitAgent({
						type: 'thought',
						content: '[Stop] Interrupted by user.'
					});
				}
			};

			bus.on('user', this.currentInterruptHandler);

			// Apply caching to the last message if it's a checkpoint
			// We set a checkpoint every 5 turns (interactions)
			if (
				this.conversationHistory.length > 0 &&
				this.conversationHistory.length % 5 === 0
			) {
				const lastMsg =
					this.conversationHistory[this.conversationHistory.length - 1];
				if (lastMsg.content) {
					// Check if it's a user or assistant message that supports content blocks
					// Ideally we cache on User messages (checkpoints)
					if (lastMsg.role === 'user' && typeof lastMsg.content === 'string') {
						lastMsg.content = [
							{
								type: 'text',
								text: lastMsg.content,
								cache_control: { type: 'ephemeral' }
							}
						];
					}
				}
			}

			const createMessage = async (model: string) => {
				const isOpus46 = model.startsWith('claude-opus-4-6');

				const baseParams: any = {
					model,
					max_tokens: this.lastConfig?.maxTokens || 8192,
					system: [systemPromptBlock],
					messages: [...this.conversationHistory],
					tools: toolDefinitionsForApi as any,
					stream: true as const
				};

				// Enable Thinking for Opus models (4.5 and 4.6)
				const isOpus = model.includes('opus');

				if (isOpus) {
					baseParams.thinking = {
						type: 'enabled',
						budget_tokens: Math.floor((this.lastConfig?.maxTokens || 8192) / 2)
					};
				}

				// Use beta API when computer use is enabled
				if (usesBetaApi && this.computerUseState.enabled) {
					const { betaFlag } = getToolConfig(model);

					// Add computer use-specific enhancements to system prompt
					const computerUseSystemAddition = `

COMPUTER USE ACTIVE:
- Screenshot: ~1429px wide (scaled from native ${this.computerUseState.displayWidth}x${this.computerUseState.displayHeight})
- Coordinates auto-scaled to native

YOUTUBE SPECIFIC - USE KEYBOARD:
After opening YouTube search results:
1. Press Tab 3-4 times to focus first video
2. Press Return to play
This is MORE RELIABLE than clicking thumbnails.

IF YOU MUST CLICK:
- State exact reasoning: "The video thumbnail is at approximately X% from left = [x], Y% from top = [y]"
- YouTube sidebar is x:0-170, videos start at x:200+
- First video thumbnail typically: x≈350, y≈350

EVALUATION: After each action, state "I see [what changed]. [Success/Retry]"`;

					const enhancedSystemBlock = {
						...systemPromptBlock,
						text: systemPromptBlock.text + computerUseSystemAddition
					};

					return (await this.client!.beta.messages.create(
						{
							...baseParams,
							system: [enhancedSystemBlock],
							betas: [betaFlag],
							stream: true as const
						},
						{ signal }
					)) as any;
				}

				// Standard API call
				return (await this.client!.messages.create(baseParams, {
					signal
				})) as any;
			};

			let stream: any;
			let currentModel = apiModel;
			let inputTokens = 0;
			let outputTokens = 0;
			let cacheReadTokens = 0;
			let cacheCreationTokens = 0;

			try {
				stream = await createMessage(apiModel);
			} catch (error: unknown) {
				const apiErr = error as {
					status?: number;
					message?: string;
					error?: { type?: string; message?: string };
				};
				// Check if it's a model availability error (404 or string match)
				const isNotFound =
					apiErr.status === 404 ||
					(apiErr.message && apiErr.message.includes('not_found_error')) ||
					(apiErr.error && apiErr.error.type === 'not_found_error');

				// Check if it's a corrupted history error (orphaned tool_use/tool_result)
				const isHistoryCorruption =
					apiErr.status === 400 &&
					(apiErr.message?.includes('tool_use_id') ||
						apiErr.message?.includes('tool_result') ||
						apiErr.error?.message?.includes('tool_use_id') ||
						apiErr.error?.message?.includes('tool_result'));

				if (isHistoryCorruption) {
					bus.emitAgent({
						type: 'thought',
						content:
							'[Context] Detected corrupted history - clearing and retrying...',
						hidden: false
					});
					// Clear corrupted history and retry with just the current message
					this.conversationHistory = [
						{
							role: 'user',
							content: userMessage || 'Continue from where we left off.'
						}
					];
					stream = await createMessage(apiModel);
				} else if (isNotFound) {
					bus.emitAgent({
						type: 'error',
						message: `Model ${apiModel} not available. Falling back to claude-haiku-4-5.`
					});
					currentModel = 'claude-haiku-4-5-20251001';
					stream = await createMessage(currentModel);
				} else {
					throw error;
				}
			}

			let fullResponse = '';
			let fullThinking = '';
			let buffer = '';
			let thinkingBuffer = '';
			const toolUses: ToolUsePartial[] = [];
			let currentToolUse: ToolUsePartial | null = null;
			let currentThinking: any = null;

			for await (const chunk of stream) {
				if (
					chunk.type === 'message_start' &&
					chunk.message &&
					chunk.message.usage
				) {
					inputTokens += chunk.message.usage.input_tokens || 0;
					outputTokens += chunk.message.usage.output_tokens || 0;

					// Track Cache Metrics
					// @ts-ignore - SDK types might trail API updates
					if (chunk.message.usage.cache_read_input_tokens) {
						cacheReadTokens += chunk.message.usage.cache_read_input_tokens;
						this.accumulatedCacheReadTokens +=
							chunk.message.usage.cache_read_input_tokens;
					}
					// @ts-ignore
					if (chunk.message.usage.cache_creation_input_tokens) {
						cacheCreationTokens +=
							chunk.message.usage.cache_creation_input_tokens;
						this.accumulatedCacheCreationTokens +=
							chunk.message.usage.cache_creation_input_tokens;
					}

					this.accumulatedInputTokens += inputTokens;
					this.accumulatedOutputTokens += outputTokens;
				}

				if (chunk.type === 'message_delta' && chunk.usage) {
					outputTokens += chunk.usage.output_tokens || 0;
					this.accumulatedOutputTokens += chunk.usage.output_tokens || 0;
				}

				if (
					chunk.type === 'content_block_start' &&
					chunk.content_block.type === 'thinking'
				) {
					currentThinking = { type: 'thinking' };
				}

				if (
					chunk.type === 'content_block_delta' &&
					chunk.delta.type === 'thinking_delta'
				) {
					const text = (chunk.delta as any).thinking;
					fullThinking += text;
					thinkingBuffer += text;

					if (thinkingBuffer.length >= 100 || text.includes('\n')) {
						bus.emitAgent({
							type: 'thought',
							content: `[Thinking] ${thinkingBuffer.trim()}`,
							hidden: false
						});
						thinkingBuffer = '';
					}
				}

				if (chunk.type === 'content_block_stop' && currentThinking) {
					currentThinking = null;
					if (thinkingBuffer) {
						bus.emitAgent({
							type: 'thought',
							content: `[Thinking] ${thinkingBuffer.trim()}`,
							hidden: false
						});
						thinkingBuffer = '';
					}
				}

				if (
					chunk.type === 'content_block_start' &&
					chunk.content_block.type === 'tool_use'
				) {
					currentToolUse = {
						id: chunk.content_block.id,
						name: chunk.content_block.name,
						input: ''
					};
				}

				if (
					chunk.type === 'content_block_delta' &&
					chunk.delta.type === 'input_json_delta'
				) {
					if (currentToolUse) {
						currentToolUse.input += chunk.delta.partial_json;
					}
				}

				if (chunk.type === 'content_block_stop' && currentToolUse) {
					try {
						// If no input_json_delta chunks were received, input is empty string
						// Treat as empty object (common for tools with no required params)
						const rawInput =
							(typeof currentToolUse.input === 'string'
								? currentToolUse.input
								: '{}') || '{}';
						currentToolUse.input = JSON.parse(rawInput) as Record<
							string,
							unknown
						>;
						toolUses.push(currentToolUse);
					} catch (e) {
						// Parse failed — still execute with empty args rather than silently dropping
						currentToolUse.input = {};
						toolUses.push(currentToolUse);
					}
				}

				if (
					chunk.type === 'content_block_delta' &&
					chunk.delta.type === 'text_delta'
				) {
					const text = chunk.delta.text;
					fullResponse += text;
					buffer += text;

					const shouldEmit =
						buffer.length >= 50 ||
						buffer.match(/[.!?]\s*$/) ||
						buffer.match(/\n/);

					if (shouldEmit) {
						bus.emitAgent({
							type: 'thought',
							content: fullResponse
						});
						buffer = '';
					}
				}
			}

			if (buffer.length > 0) {
				bus.emitAgent({
					type: 'thought',
					content: fullResponse
				});
			}

			// Execute tools if any were requested
			if (toolUses.length > 0) {
				const toolResults: Anthropic.ToolResultBlockParam[] = [];

				for (const toolUse of toolUses) {
					if (signal.aborted) break;

					let result;

					try {
						// At this point input has been parsed from JSON string to object
						const args = (
							typeof toolUse.input === 'string' ? {} : toolUse.input
						) as Record<string, unknown>;
						// Handle Anthropic-defined tools
						// Note: Coordinate scaling is now handled in ComputerUseTool (tools.ts)
						// This ensures scaling works both with and without pilot mode
						if (this.computerUseState.enabled && toolUse.name === 'computer') {
							result = await tools.execute('computer', args);
						} else if (
							this.computerUseState.enabled &&
							toolUse.name === 'str_replace_based_edit_tool'
						) {
							// Map Anthropic text_editor to our edit tool
							const cmd = args.command as string | undefined;
							if (cmd === 'view') {
								result = await tools.execute('read', { path: args.path });
							} else if (cmd === 'create') {
								result = await tools.execute('write', {
									path: args.path,
									content: (args.file_text as string) || ''
								});
							} else if (cmd === 'str_replace') {
								result = await tools.execute('edit', {
									path: args.path,
									search: args.old_str,
									replace: args.new_str
								});
							} else {
								result = {
									success: false,
									error: `Unknown editor command: ${cmd}`
								};
							}
						} else if (
							this.computerUseState.enabled &&
							toolUse.name === 'bash'
						) {
							// Anthropic bash tool - pass through to our bash tool
							result = await tools.execute('bash', { command: args.command });
						} else {
							// Standard tool execution
							result = await tools.execute(toolUse.name, args);
						}
					} catch (toolError: unknown) {
						bus.emitAgent({
							type: 'error',
							message: `[Tool] ${toolUse.name} execution failed: ${toolError instanceof Error ? toolError.message : String(toolError)}`
						});
						result = {
							success: false,
							error: `Tool execution failed: ${toolError instanceof Error ? toolError.message : String(toolError)}`
						};
					}

					// Redact PII
					let outputContent = result.success
						? result.output || 'Success'
						: result.error || 'Failed';
					const redactionResult = redactor.redactToolOutput(
						toolUse.name,
						outputContent
					);

					if (redactionResult.redactionCount > 0) {
						outputContent = redactionResult.text;
						bus.emitAgent({
							type: 'thought',
							content: `[Security] Redacted ${redactionResult.redactionCount} sensitive item(s)`,
							hidden: true
						});
					}

					// Truncate output logic is handled in tools.execute wrapper now (BashTool),
					// but we ensure safety here for other tools
					if (outputContent.length > 20000) {
						outputContent =
							outputContent.slice(0, 5000) +
							`\n... [${outputContent.length - 10000} chars truncated] ...\n` +
							outputContent.slice(-5000);
					}

					let toolResultContent:
						| string
						| Anthropic.ToolResultBlockParam['content'] = outputContent;

					// If we have structured content (like image blocks), use them
					if (result.content && Array.isArray(result.content)) {
						toolResultContent = result.content.map((block) => {
							if (block.type === 'image') {
								return {
									type: 'image',
									source: {
										type: 'base64' as const,
										media_type: (block.mimeType || 'image/png') as
											| 'image/png'
											| 'image/jpeg'
											| 'image/gif'
											| 'image/webp',
										data: block.data
									}
								};
							}
							if (block.type === 'text') {
								return {
									type: 'text',
									text: block.text
								};
							}
							return block;
						});
					}

					toolResults.push({
						type: 'tool_result',
						tool_use_id: toolUse.id,
						content: toolResultContent,
						is_error: !result.success
					});

					// Emit informational tool results as thoughts so user sees them
					// (don't rely on LLM to always comment on results)
					if (result.success && outputContent && !result.content) {
						bus.emitAgent({
							type: 'thought',
							content: outputContent
						});
						// Track tool outputs for fallback when LLM generates no text
						this.lastToolOutputs.push(outputContent);
					}
				}

				// Add assistant message with tool uses to history
				this.conversationHistory.push({
					role: 'assistant',
					content: [
						...(fullThinking
							? [{ type: 'thinking' as any, thinking: fullThinking }]
							: []),
						...(fullResponse
							? [{ type: 'text' as const, text: fullResponse }]
							: []),
						...toolUses.map((tu) => ({
							type: 'tool_use' as const,
							id: tu.id,
							name: tu.name,
							input: tu.input
						}))
					] as any
				});

				// Add context budget warning if approaching limits (like Claude Code)
				const postToolUsage = usage.getContextUsage(currentModel);
				const postToolPercent =
					(postToolUsage.used / CONTEXT.MAX_TOKENS_TOTAL) * 100;

				// Inject system warning as text block instead of fake tool_result
				// (tool_result requires matching tool_use which would cause API errors)
				let systemWarning: Anthropic.TextBlockParam | null = null;
				if (postToolPercent > 70) {
					systemWarning = {
						type: 'text',
						text: `<system_warning>Token usage: ${postToolUsage.used}/${CONTEXT.MAX_TOKENS_TOTAL}; ${postToolUsage.remaining} remaining</system_warning>`
					};
				}

				// Prune old images from history to prevent context explosion
				// Keep only the most recent image (computer use generates many, each ~50k tokens)
				if (this.computerUseState.enabled) {
					this.pruneImagesFromHistory(1);
				}

				// Add tool results to history (with optional system warning as text)
				this.conversationHistory.push({
					role: 'user',
					content: systemWarning ? [...toolResults, systemWarning] : toolResults
				});

				// Continue conversation with tool results
				const recursiveResponse = await this.streamChat('');

				// If LLM responded with meaningful text, use that
				if (recursiveResponse && recursiveResponse.trim()) {
					return recursiveResponse;
				}

				// LLM didn't respond - extract and return tool output as the response
				// This ensures user ALWAYS sees something, not just "Completed in X.Xs"
				if (toolResults.length > 0) {
					const lastToolResult = toolResults[toolResults.length - 1];
					let content = lastToolResult.content;

					// Handle array content (extract text blocks)
					if (Array.isArray(content)) {
						content = content
							.filter((b: any) => b.type === 'text')
							.map((b: any) => b.text)
							.join('\n');
					}

					if (typeof content === 'string' && content.trim()) {
						bus.emitAgent({
							type: 'thought',
							content: content
						});
						return content;
					}
				}

				// Last resort fallback
				return recursiveResponse || '';
			}

			// Add assistant response to history
			if (fullResponse || fullThinking) {
				this.conversationHistory.push({
					role: 'assistant',
					content: [
						...(fullThinking
							? [{ type: 'thinking' as any, thinking: fullThinking }]
							: []),
						...(fullResponse
							? [{ type: 'text' as any, text: fullResponse }]
							: [])
					] as any
				});
			}

			// Calculate context size for the last request (snapshot)
			// inputTokens includes cacheCreation, so we only add cacheReadTokens
			const currentContextSize = inputTokens + cacheReadTokens;

			// Track accumulated tokens including cache metrics
			// We pass the *accumulated* tokens for cost tracking, but the *current* context size for health tracking
			await usage.track(
				currentModel,
				this.accumulatedInputTokens,
				this.accumulatedOutputTokens,
				this.accumulatedCacheReadTokens,
				this.accumulatedCacheCreationTokens,
				currentContextSize
			);

			// Persist valid conversation state
			await this.persistHistory();

			return fullResponse;
		} catch (error: unknown) {
			const apiErr = error as {
				name?: string;
				type?: string;
				status?: number;
				message?: string;
			};
			if (apiErr.name === 'AbortError' || apiErr.type === 'aborted') {
				return null;
			}
			// Actionable error messages
			let errorMsg: string;
			if (apiErr.status === 401) {
				errorMsg = 'Invalid API key -> Run /init to reconfigure';
			} else if (apiErr.status === 429) {
				errorMsg = 'Rate limited -> Wait a moment and try again';
			} else if (apiErr.status === 529 || apiErr.status === 503) {
				errorMsg = 'API overloaded -> Retry in a few seconds';
			} else if (apiErr.status === 400) {
				errorMsg = `Bad request: ${apiErr.message || 'Check model name and parameters'}`;
			} else if (apiErr.message?.includes('ECONNREFUSED') || apiErr.message?.includes('fetch failed')) {
				errorMsg = 'Connection failed -> Check your network or Ollama server';
			} else {
				errorMsg = apiErr.status
					? `[${apiErr.status}] ${apiErr.message}`
					: apiErr.message || String(error);
			}
			bus.emitAgent({
				type: 'error',
				message: `LLM Error: ${errorMsg}`
			});
			// Also log to console for debugging (error already emitted above)
			if (process.env.DEBUG) console.error('[LLM] API Error:', error);
			return null;
		} finally {
			this.abortController = null;
			// Clean up interrupt listener
			if (this.currentInterruptHandler) {
				bus.off('user', this.currentInterruptHandler);
				this.currentInterruptHandler = null;
			}
		}
	}

	/**
	 * History Pruning (Context Editing)
	 * Keep recent 30 messages + System Prompt (handled separate)
	 * Limit history to ~150k tokens (heuristic)
	 */
	/**
	 * Smart Context Management
	 * Uses summarization to compress older history instead of deleting it.
	 */
	private async compressHistory() {
		if (this.conversationHistory.length > CONTEXT.MAX_MESSAGES) {
			// Only summarize/prune if we are well past the limit to avoid thrashing
			if (
				this.conversationHistory.length <
				CONTEXT.MAX_MESSAGES + CONTEXT.BUFFER
			)
				return;

			// Identify the block to summarize
			const summarizeStart = CONTEXT.KEEP_FIRST;
			const summarizeEnd = this.conversationHistory.length - CONTEXT.KEEP_LAST;
			const messagesToSummarize = this.conversationHistory.slice(
				summarizeStart,
				summarizeEnd
			);

			if (messagesToSummarize.length < 5) return; // Wait for a decent chunk

			bus.emitAgent({
				type: 'thought',
				content: `[Context] Compressing ${messagesToSummarize.length} messages using ${this.lastConfig?.summarizerModel || 'Haiku'}...`,
				hidden: true
			});

			try {
				const summary = await this.summarizeBlock(messagesToSummarize);

				// Store as episodic memory
				try {
					const { memory } = await import('../memory.js');
					await memory.store(
						'daily_summary',
						`context_compression_${Date.now()}`,
						summary
					);
				} catch (memError) {
					// Non-fatal, continue with compression
				}

				// Construct new history
				const keptStart = this.conversationHistory.slice(0, CONTEXT.KEEP_FIRST);
				const keptEnd = this.conversationHistory.slice(summarizeEnd);

				this.conversationHistory = [
					...keptStart,
					{
						role: 'user',
						content: `[System: Context compressed. Previous conversation summary below.]\n<conversation_summary>\n${summary}\n</conversation_summary>`
					},
					...keptEnd
				];

				bus.emitAgent({
					type: 'thought',
					content: `[Context] Successfully compressed history.`,
					hidden: true
				});
			} catch (error) {
				bus.emitAgent({
					type: 'error',
					message: `[Context] Summarization failed: ${error}. Falling back to standard pruning.`
				});
				// Fallback to delete-only if summarization fails
				this.pruneHistoryFallback();
			}
		}
	}

	private async summarizeBlock(
		messages: Anthropic.MessageParam[]
	): Promise<string> {
		if (!this.client) return 'Summary unavailable.';

		const summarizerModel =
			this.lastConfig?.summarizerModel || 'claude-haiku-4-5-20251001';

		// Prepare messages for the summarizer
		// We simple convert `tool_use` / `tool_result` to text representations to avoid complex tool definitions for the summarizer
		const simplifiedMessages: Anthropic.MessageParam[] = messages.map((m) => {
			if (Array.isArray(m.content)) {
				// Flatten content blocks to text
				const textContent = m.content
					.map((b) => {
						if (b.type === 'text') return b.text;
						if (b.type === 'tool_use') return `[Tool Use: ${b.name}]`;
						if (b.type === 'tool_result')
							return `[Tool Result: ${typeof b.content === 'string' ? b.content.slice(0, 500) + '...' : 'Data'}]`; // Truncate tool results heavily
						return '';
					})
					.join('\n');
				return { role: m.role, content: textContent };
			}
			return m;
		});

		const prompt = `Please summarize the following conversation segment. Focus on:
1. Key user requests and intents.
2. Important actions taken by the agent (tools used).
3. Key occurrences of errors or successes.
4. Any critical data/context that might be needed later.
Be concise but comprehensive.

CONVERSATION SEGMENT:
${JSON.stringify(simplifiedMessages, null, 2)}
`;

		const response = await this.client.messages.create({
			model: summarizerModel,
			max_tokens: 1024,
			messages: [{ role: 'user', content: prompt }]
		});

		if (response.content[0].type === 'text') {
			return response.content[0].text;
		}
		return 'Summary generation returned non-text content.';
	}

	private pruneHistoryFallback() {
		// Original pruning logic (Moved here as fallback)
		if (this.conversationHistory.length > CONTEXT.MAX_MESSAGES) {
			const keepFirst = CONTEXT.KEEP_FIRST;
			const keepLast = 20; // Keep slightly more for safety in fallback

			const removalCount =
				this.conversationHistory.length - (keepFirst + keepLast);
			if (removalCount > 0) {
				const keptStart = this.conversationHistory.slice(0, keepFirst);
				const keptEnd = this.conversationHistory.slice(-keepLast);

				this.conversationHistory = [
					...keptStart,
					{
						role: 'user',
						content: `[... History Pruned: ${removalCount} intermediate messages were removed to save context ...]`
					},
					...keptEnd
				];
			}
		}
	}

	/**
	 * Stream chat via provider (Ollama/MoE mode)
	 */
	private async streamChatViaProvider(
		userMessage: string,
		options?: { allowedTools?: string[] }
	): Promise<string | null> {
		try {
			// Add user message to history
			if (userMessage.trim()) {
				this.toolIterations = 0;
				this.lastToolOutputs = [];
				this.accumulatedInputTokens = 0;
				this.accumulatedOutputTokens = 0;

				this.conversationHistory.push({
					role: 'user',
					content: userMessage
				});
			} else {
				this.toolIterations++;
				if (this.toolIterations > MAX_TOOL_ITERATIONS) {
					bus.emitAgent({
						type: 'error',
						message: `Tool iteration limit (${MAX_TOOL_ITERATIONS}) exceeded.`
					});
					return null;
				}
			}

			// Get provider from router
			const provider = await router.route(this.conversationHistory);
			const taskType = router.classifyTask(this.conversationHistory);
			const cfg = await config.load();

			// Build system prompt (exactly the same as Claude, including context stats)
			const ctxUsage = usage.getContextUsage(provider.getModel());
			const capabilities = provider.getCapabilities();
			const systemPrompt = await this.buildSystemPrompt({
				omitTools: !capabilities.toolCalling && taskType === 'simple_chat',
				tokensUsed: ctxUsage.used,
				tokenBudget: CONTEXT.MAX_TOKENS_TOTAL
			});

			const availableTools = await tools.list();

			// Convert tools to provider format
			const toolDefs = availableTools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				input_schema: {
					type: 'object' as const,
					properties: tool.inputSchema,
					required: tool.requiredParams
				}
			}));

			// Stream from provider
			let fullResponse = '';
			let buffer = '';
			const toolUses: Array<{
				id: string;
				name: string;
				input: Record<string, unknown>;
			}> = [];

			for await (const chunk of provider.chat(this.conversationHistory, {
				systemPrompt,
				tools: capabilities.toolCalling ? toolDefs : undefined,
				maxTokens: cfg.maxTokens
			})) {
				// Handle usage
				if (chunk.type === 'message_start' && chunk.usage) {
					this.accumulatedInputTokens += chunk.usage.inputTokens;
					this.accumulatedOutputTokens += chunk.usage.outputTokens || 0;
				}

				if (chunk.type === 'message_delta' && chunk.usage) {
					this.accumulatedOutputTokens += chunk.usage.outputTokens || 0;
				}

				// Handle text
				if (chunk.type === 'text' && chunk.text) {
					fullResponse += chunk.text;
					buffer += chunk.text;

					if (
						buffer.length >= 50 ||
						buffer.match(/[.!?]\s*$/) ||
						buffer.match(/\n/)
					) {
						bus.emitAgent({
							type: 'thought',
							content: fullResponse
						});
						buffer = '';
					}
				}

				// Handle thinking
				if (chunk.type === 'thinking' && chunk.thinking) {
					bus.emitAgent({
						type: 'thought',
						content: `[Thinking] ${chunk.thinking}`,
						hidden: false
					});
				}

				// Handle tool use
				if (chunk.type === 'tool_use' && chunk.toolUse) {
					toolUses.push(chunk.toolUse);
				}
			}

			// Flush remaining buffer
			if (buffer.length > 0) {
				bus.emitAgent({
					type: 'thought',
					content: fullResponse
				});
			}

			// Execute tools if any
			if (toolUses.length > 0) {
				const toolResults: Anthropic.ToolResultBlockParam[] = [];

				for (const toolUse of toolUses) {
					let result;
					try {
						result = await tools.execute(toolUse.name, toolUse.input);
					} catch (error) {
						result = { success: false, error: String(error) };
					}

					const outputContent = result.success
						? result.output || 'Success'
						: result.error || 'Failed';
					toolResults.push({
						type: 'tool_result',
						tool_use_id: toolUse.id,
						content: outputContent,
						is_error: !result.success
					});

					if (result.success && outputContent) {
						bus.emitAgent({
							type: 'thought',
							content: outputContent
						});
						this.lastToolOutputs.push(outputContent);
					}
				}

				// Add to history
				this.conversationHistory.push({
					role: 'assistant',
					content: [
						...(fullResponse
							? [{ type: 'text' as const, text: fullResponse }]
							: []),
						...toolUses.map((tu) => ({
							type: 'tool_use' as const,
							id: tu.id,
							name: tu.name,
							input: tu.input
						}))
					] as any
				});

				this.conversationHistory.push({
					role: 'user',
					content: toolResults
				});

				// Continue conversation
				return await this.streamChatViaProvider('');
			}

			// Add assistant response to history
			if (fullResponse) {
				this.conversationHistory.push({
					role: 'assistant',
					content: fullResponse
				});
			}

			// Track usage
			await usage.track(
				provider.getModel(),
				this.accumulatedInputTokens,
				this.accumulatedOutputTokens,
				0,
				0,
				this.accumulatedInputTokens
			);

			return fullResponse;
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			const hint = errMsg.includes('ECONNREFUSED')
				? ' -> Is Ollama running? Start with: ollama serve'
				: errMsg.includes('fetch failed')
					? ' -> Check network connection'
					: '';
			bus.emitAgent({
				type: 'error',
				message: `Provider error: ${errMsg}${hint}`
			});
			return null;
		}
	}

	clearHistory(): void {
		this.conversationHistory = [];
	}

	/**
	 * Get all tool outputs from the current turn (for fallback when LLM generates no text).
	 * Returns concatenated output or null if no tools were used.
	 */
	getLastToolOutput(): string | null {
		if (this.lastToolOutputs.length === 0) return null;
		const output = this.lastToolOutputs.join('\n\n');
		return output;
	}

	/**
	 * Get a snapshot of the current conversation history for persistence
	 */
	getHistorySnapshot(): Anthropic.MessageParam[] {
		return [...this.conversationHistory];
	}

	/**
	 * Persist current history to DB
	 */
	private async persistHistory() {
		const { context } = await import('../context.js');
		const { db } = await import('../database.js');

		const sessionId = context.get().session_id;
		if (!sessionId) return;

		try {
			db.getDb()
				.prepare('UPDATE sessions SET llm_history = ? WHERE id = ?')
				.run(JSON.stringify(this.conversationHistory), sessionId);
		} catch (e) {
			bus.emitAgent({
				type: 'thought',
				content: `[Context] Failed to persist LLM history: ${e instanceof Error ? e.message : String(e)}`,
				hidden: true
			});
		}
	}

	/**
	 * Restore conversation history from a saved session
	 * Validates history to prevent API errors from orphaned tool_use blocks
	 */
	restoreHistory(history: Anthropic.MessageParam[]) {
		if (!Array.isArray(history) || history.length === 0) {
			return;
		}

		// Validate and fix history to prevent tool_use without tool_result errors
		const validatedHistory = this.validateAndFixHistory(history);

		// Final integrity check - verify no orphaned tool_results exist
		if (!this.verifyHistoryIntegrity(validatedHistory)) {
			bus.emitAgent({
				type: 'thought',
				content: `[Context] History validation failed - starting fresh to avoid API errors.`,
				hidden: false
			});
			this.conversationHistory = [];
			return;
		}

		this.conversationHistory = validatedHistory;
		bus.emitAgent({
			type: 'thought',
			content: `[Context] Restored ${validatedHistory.length} messages from saved session.`,
			hidden: true
		});
	}

	/**
	 * Verify history integrity - check that all tool_results have matching tool_uses
	 */
	private verifyHistoryIntegrity(history: Anthropic.MessageParam[]): boolean {
		for (let i = 0; i < history.length; i++) {
			const msg = history[i];
			const prevMsg = history[i - 1];

			if (msg.role === 'user' && Array.isArray(msg.content)) {
				const toolResults = (msg.content as unknown as ContentBlock[]).filter(
					(b) => b.type === 'tool_result'
				);

				if (toolResults.length > 0) {
					// Must have a previous assistant message with matching tool_uses
					if (
						!prevMsg ||
						prevMsg.role !== 'assistant' ||
						!Array.isArray(prevMsg.content)
					) {
						return false;
					}

					const toolUseIds = new Set(
						(prevMsg.content as unknown as ContentBlock[])
							.filter((b) => b.type === 'tool_use')
							.map((b) => b.id)
					);

					for (const tr of toolResults) {
						if (!toolUseIds.has(tr.tool_use_id)) {
							return false;
						}
					}
				}
			}
		}
		return true;
	}

	/**
	 * Validate conversation history and remove orphaned tool blocks
	 * - Each tool_use must have a corresponding tool_result in the next message
	 * - Each tool_result must have a corresponding tool_use in the previous message
	 */
	private validateAndFixHistory(
		history: Anthropic.MessageParam[]
	): Anthropic.MessageParam[] {
		const validated: Anthropic.MessageParam[] = [];

		for (let i = 0; i < history.length; i++) {
			const msg = history[i];
			const nextMsg = history[i + 1];
			const prevMsg = validated[validated.length - 1];

			// Check if this message contains tool_result blocks (user message after assistant tool_use)
			if (msg.role === 'user' && Array.isArray(msg.content)) {
				const toolResultBlocks = (
					msg.content as unknown as ContentBlock[]
				).filter((b) => b.type === 'tool_result');

				if (toolResultBlocks.length > 0) {
					// Check if previous message has corresponding tool_uses
					if (
						!prevMsg ||
						prevMsg.role !== 'assistant' ||
						!Array.isArray(prevMsg.content)
					) {
						// No valid tool_use precedes - strip tool_result blocks
						const nonToolBlocks = (
							msg.content as unknown as ContentBlock[]
						).filter((b) => b.type !== 'tool_result');
						if (nonToolBlocks.length > 0) {
							validated.push({
								role: 'user',
								content:
									nonToolBlocks as unknown as Anthropic.ContentBlockParam[]
							});
						}
						continue;
					}

					// Get tool_use IDs from previous assistant message
					const toolUseIds = new Set(
						(prevMsg.content as unknown as ContentBlock[])
							.filter((b) => b.type === 'tool_use')
							.map((b) => b.id)
					);

					// Filter to only valid tool_results
					const validToolResults = toolResultBlocks.filter((tr) =>
						toolUseIds.has(tr.tool_use_id as string)
					);
					const nonToolBlocks = (
						msg.content as unknown as ContentBlock[]
					).filter((b) => b.type !== 'tool_result');

					if (validToolResults.length !== toolResultBlocks.length) {
						// Some tool_results are orphaned - reconstruct message with only valid ones
						if (validToolResults.length === 0 && nonToolBlocks.length > 0) {
							validated.push({
								role: 'user',
								content:
									nonToolBlocks as unknown as Anthropic.ContentBlockParam[]
							});
							continue;
						} else if (validToolResults.length > 0) {
							validated.push({
								role: 'user',
								content: [
									...nonToolBlocks,
									...validToolResults
								] as unknown as Anthropic.ContentBlockParam[]
							});
							continue;
						}
						// Skip entirely if no valid content remains
						continue;
					}
				}
			}

			// Check if this message contains tool_use blocks
			if (msg.role === 'assistant' && Array.isArray(msg.content)) {
				const toolUseBlocks = (msg.content as unknown as ContentBlock[]).filter(
					(b) => b.type === 'tool_use'
				);

				if (toolUseBlocks.length > 0) {
					// Check if next message has corresponding tool_results
					if (
						!nextMsg ||
						nextMsg.role !== 'user' ||
						!Array.isArray(nextMsg.content)
					) {
						// No valid tool_result follows - strip tool_use blocks from this message
						const textBlocks = (
							msg.content as unknown as ContentBlock[]
						).filter((b) => b.type === 'text');
						if (textBlocks.length > 0) {
							validated.push({
								role: 'assistant',
								content: textBlocks.map((b) => b.text as string).join('\n')
							});
						}
						continue;
					}

					// Verify each tool_use has a matching tool_result
					const toolResultIds = new Set(
						(nextMsg.content as unknown as ContentBlock[])
							.filter((b) => b.type === 'tool_result')
							.map((b) => b.tool_use_id)
					);

					const validToolUses = toolUseBlocks.filter((tu) =>
						toolResultIds.has(tu.id as string)
					);

					if (validToolUses.length !== toolUseBlocks.length) {
						// Some tool_uses are orphaned - reconstruct message with only valid ones
						const textBlocks = (
							msg.content as unknown as ContentBlock[]
						).filter((b) => b.type === 'text');
						if (validToolUses.length === 0 && textBlocks.length > 0) {
							validated.push({
								role: 'assistant',
								content: textBlocks.map((b) => b.text as string).join('\n')
							});
							continue;
						} else if (validToolUses.length > 0) {
							validated.push({
								role: 'assistant',
								content: [
									...textBlocks,
									...validToolUses
								] as unknown as Anthropic.ContentBlockParam[]
							});
							continue;
						}
						continue;
					}
				}
			}

			validated.push(msg);
		}

		return validated;
	}
}

export const llm = new LLMClient();
