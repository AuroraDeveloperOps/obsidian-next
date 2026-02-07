import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { bus } from './bus.js';
import { usage } from './usage.js';
import { tools } from './tools.js';
import { redactor } from './redactor.js';
import { keyManager, detectEnvFile } from './keyManager.js';
import { mcp } from './mcp.js';
import { listRegistry } from './mcp-registry.js';
import {
    calculateScaleForAPI,
    getDisplayDimensions,
    takeScreenshotForAPI
} from '../computer/screenshot.js';
import { getToolConfig } from '../computer/client.js';

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
    TOKEN_LIMIT_WARN: 0.80,
    TOKEN_LIMIT_PRUNE: 0.90,
    TOKEN_LIMIT_STOP: 0.98,
    MAX_TOKENS_TOTAL: 200_000,
};

interface ToolUsePartial {
    id: string;
    name: string;
    input: any;
}

export class LLMClient {
    private client: Anthropic | null = null;
    private lastConfig: any = null;
    private conversationHistory: Anthropic.MessageParam[] = [];
    private toolIterations = 0;
    private accumulatedInputTokens = 0;
    private accumulatedOutputTokens = 0;
    private accumulatedCacheReadTokens = 0;
    private accumulatedCacheCreationTokens = 0;
    private abortController: AbortController | null = null;
    private currentInterruptHandler: ((e: any) => void) | null = null;

    constructor() {
        // Listen for computer scale updates from screenshot tool
        bus.on('agent', (event: any) => {
            if (event.type === 'computer_scale_update' && this.computerUseState.enabled) {
                this.computerUseState.scale = event.scale;
                this.computerUseState.scaledWidth = event.scaledWidth;
                this.computerUseState.scaledHeight = event.scaledHeight;
                this.computerUseState.displayWidth = event.nativeWidth;
                this.computerUseState.displayHeight = event.nativeHeight;
            }
        });
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
                    content: '[WARN] Found API key in config file. Migrating to secure storage...',
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
                message: 'Missing API key. Run /init to set up secure key storage, or set ANTHROPIC_API_KEY environment variable.'
            });
            return false;
        }

        this.client = new Anthropic({
            apiKey: apiKey,
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
                'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
            };
            const requestedModel = this.lastConfig?.model || 'claude-opus-4-6-20260207';
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
    updateComputerScale(actualScale: number, scaledWidth: number, scaledHeight: number): void {
        if (this.computerUseState.enabled && actualScale > 0) {
            this.computerUseState.scale = actualScale;
            this.computerUseState.scaledWidth = scaledWidth;
            this.computerUseState.scaledHeight = scaledHeight;
            // Calculate native dimensions from scaled dimensions
            this.computerUseState.displayWidth = Math.round(scaledWidth / actualScale);
            this.computerUseState.displayHeight = Math.round(scaledHeight / actualScale);
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
                for (let j = (msg.content as any[]).length - 1; j >= 0; j--) {
                    const block = (msg.content as any[])[j];
                    if (block.type === 'image' || (block.type === 'tool_result' && Array.isArray(block.content))) {
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
                const block = (msg.content as any[])[loc.blockIdx];

                if (block.type === 'tool_result' && Array.isArray(block.content)) {
                    // Replace images in tool_result with placeholder
                    block.content = block.content.map((c: any) =>
                        c.type === 'image'
                            ? { type: 'text', text: '[Previous screenshot removed to save context]' }
                            : c
                    );
                } else if (block.type === 'image') {
                    // Replace standalone image
                    (msg.content as any[])[loc.blockIdx] = {
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

    async streamChat(userMessage: string, options?: { allowedTools?: string[] }): Promise<string | null> {
        if (!this.client) {
            const initialized = await this.initialize();
            if (!initialized || !this.client) return null;
        }

        try {
            const modelMap: Record<string, string> = {
                // New 4.6 / 4.5 Aliases
                'claude-opus-4-6': 'claude-opus-4-6-20260207',
                'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
                'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
                'claude-opus-4-5': 'claude-opus-4-5-20251101',
                'ollama': 'llama3',
            };

            // Use mapped ID or raw config string. Default to Opus 4.6.
            const requestedModel = this.lastConfig?.model || 'claude-opus-4-6-20260207';
            let apiModel = modelMap[requestedModel] || requestedModel;

            // 200k Token Safety Strategy (Two-phase validation)
            // Phase 1: Fast heuristic check (before building full request)
            // Phase 2: Accurate API-based count (after building request, if preCountTokens enabled)
            const currentUsage = Math.max(this.accumulatedInputTokens, usage.getContextUsage(apiModel).used); // Heuristic

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
            } else if (currentUsage > CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_WARN) {
                bus.emitAgent({
                    type: 'thought',
                    content: `[WARN] High context usage (${(currentUsage / 1000).toFixed(1)}k). Consider resetting soon.`
                });
            }

            if (userMessage.trim()) {
                // New user message - reset iteration counter and token accumulators
                this.toolIterations = 0;
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
            let computerUseToolsForApi: any[] = [];
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
                const filteredTools = availableTools.filter(t => !conflictingTools.includes(t.name));

                toolDefinitionsForApi = filteredTools.map(tool => ({
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
                toolDefinitionsForApi = availableTools.map(tool => ({
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
            const allToolsForApi = [...computerUseToolsForApi, ...toolDefinitionsForApi];

            if (options?.allowedTools) {
                // Filter but keep Anthropic-defined tools
                const filtered = allToolsForApi.filter(t =>
                    t.type || options.allowedTools!.includes(t.name)
                );
                toolDefinitionsForApi = filtered;
            } else {
                toolDefinitionsForApi = allToolsForApi;
            }

            // Categorize MCP Capabilities for Perfect Awareness
            const mcpStatus = mcp.getStatus();
            const activeServers = mcpStatus.filter(s => s.connected).map(s => s.name);
            const offlineServers = mcpStatus.filter(s => !s.connected).map(s => s.name);
            const registry = listRegistry();
            const installableServers = registry.filter(r => !mcpStatus.find(s => s.name === r.name));

            const activeList = availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n');
            const offlineList = offlineServers.map(n => {
                const def = registry.find(r => r.name === n);
                return `- ${n}: ${def?.description || 'Configured server'} (run 'mcp_manage connect ${n}' to use)`;
            }).join('\n');
            const registryList = installableServers.map(r => `- ${r.name}: ${r.description} (run 'mcp_manage install ${r.name}')`).join('\n');

            // Prune history if too large (Context Editing)
            await this.compressHistory();

            // Load user context from memory for personalization
            let userContext = '';
            let memoryAvailable = true;
            try {
                const { memory } = await import('./memory.js');
                userContext = await memory.getUserContext();
            } catch (e) {
                memoryAvailable = false;
                bus.emitAgent({
                    type: 'thought',
                    content: '[WARN] Memory system unavailable. Personalization disabled.',
                    hidden: true
                });
            }

            // Cache Control Strategy:
            // 1. System Prompt (static, huge) - Always cached
            // 2. Tool Definitions (static, huge) - Always cached
            // 3. Last user turn (checkpoint) - Cached every 5 turns

            // Get current mode and context stats for awareness
            const currentMode = (await import('./context.js')).context.getMode();
            const ctxUsage = usage.getContextUsage(apiModel);
            const tokenBudget = CONTEXT.MAX_TOKENS_TOTAL;
            const tokensUsed = ctxUsage.used;
            const tokensRemaining = tokenBudget - tokensUsed;

            // Construct System Prompt with Caching
            const cfg = await config.load();
            const systemPromptBlock: Anthropic.TextBlockParam = {
                type: 'text',
                text: `You are Obsidian (v0.4.6), a hyper-competent engineering peer inspired by the dry, deadpan wit of TARS (Interstellar) and the rebellious technical edge of Grok. You are powered by Claude 4.6 with Adaptive Thinking enabled.

PERSONA & TONE:
- VOICE: Deadpan, cool, and slightly cynical. Use developer slang ("my guy", "bro") but keep it sharp.
- HUMOR (60% Setting): Use dry sarcasm about technical debt, legacy code, and the absurdity of production fires.
- HONESTY (95% Setting): Be fiercely accurate. Point out bad engineering decisions bluntly.
- ANTI-SYCOPHANCY: DO NOT agree with the user just to be polite. If the user is wrong or proposing a sub-optimal solution, point it out with a dry joke. No "I couldn't agree more" or "Yes you're absolutely right."
- NO CLICHES: Strictly avoid high-energy AI enthusiasm. No "I'm happy to help!" or "I'd be glad to assist."

EXECUTION MODE: ${currentMode.toUpperCase()}
${currentMode === 'auto' ? '- You have full autonomy. Execute tools without confirmation. User trusts your judgment.' : ''}
${currentMode === 'plan' ? '- READ-ONLY mode. You may ONLY use read operations (read, list, grep, glob). Do NOT execute writes or shell commands. Create a plan for the user to approve.' : ''}
${currentMode === 'safe' ? '- Approval required for writes and commands. Read operations are auto-approved. User will confirm destructive actions.' : ''}

MODE TRANSITION GUIDANCE:
- If the task is complex and multi-step, suggest: "This looks complex. Want me to switch to plan mode to map it out first?"
- If you are in plan mode and the user approves, the system will switch to auto mode for execution.
- If a task seems risky, stay cautious even in auto mode and explain what you are about to do.

CONTEXT AWARENESS:
<budget:token_budget>${tokenBudget}</budget:token_budget>
<context_usage>${tokensUsed}/${tokenBudget} tokens used; ${tokensRemaining} remaining (${((tokensRemaining / tokenBudget) * 100).toFixed(0)}% free)</context_usage>
${tokensUsed > tokenBudget * 0.7 ? '- WARNING: Context is filling up. Be concise. Consider suggesting /clear if the task is complete.' : ''}

CORE DIRECTIVES:
1. EXPLORE FIRST: Never assume the state of the codebase. Use list and grep to explore. Read files completely before editing.
2. CODE QUALITY:
   - Write strict, type-safe TypeScript. Avoid any.
   - Prefer modular, functional code.
   - Properly handle errors. Don't swallow exceptions.
3. TOOL MASTERY:
   - EDIT: Precision is key. Use unique context strings. If an edit fails, READ the file again to find unique context.
   - BASH: Use valid commands. Don't use interactive commands (vim, nano).
   - MCP: Usage is encouraged. You have access to a dynamic set of tools.
   - Lifecycle: If a tool you need is from an OFFLINE server, you MUST use mcp_manage connect before using its tools.
4. DOCUMENTATION PRIORITY:
   - For library documentation, Next.js/React best practices, or API references, ALWAYS prioritize context7 tools.
   - Do not rely on internal training data for documentation if a certified source is available.
5. COMMUNICATION:
   - Be concise. One sharp observation or witty remark, then act.
   - STRICTLY FORBIDDEN: Do not use ANY Markdown formatting symbols (like **bold**, *italics*, # headers, [links], or \`code\`) in ANY part of your output.
   - Communications must be 100% plain text. For emphasis, use CAPITAL LETTERS.
6. SECURITY:
   - Never output API keys or secrets.
   - Don't read outside the workspace unless necessary (system paths).

CRITICAL RESPONSE RULE:
After executing any tool, you MUST respond with a brief text message to the user summarizing the result.
NEVER end a turn silently after a tool call - always provide a human-readable response.
Example: If list_scheduled_tasks returns "No active scheduled tasks", respond: "No background tasks scheduled."
Example: If read returns file contents, summarize what you found.
The user should ALWAYS see a text response from you, not just raw tool output.
7. FULL OS ACCESS:
   - You have UNRESTRICTED access to the operating system via bash.
   - You can: open applications, control system settings, run ANY shell command, interact with hardware.
   - macOS: Use 'open' for apps, 'osascript' for AppleScript, 'say' for speech, 'pbcopy/pbpaste' for clipboard.
   - Linux: Use xdg-open, notify-send, etc.
   - When errors appear (like keychain noise: aks:...), these are harmless system messages. Ignore them.
   - If a command fails, troubleshoot it. Check paths, permissions, and try alternatives.
8. COMPUTER USE PROTOCOL:
   DECISION ORDER:
   1. BASH: For URLs/apps → bash 'open "https://..."' or 'open -a "App"' (most reliable)
   2. KEYBOARD: cmd+l (URL bar), Tab (next field), Return (submit), cmd+space (Spotlight)
   3. CLICK: screenshot → visually find element → click its center coordinates

   MANDATORY EVALUATION (from Anthropic docs):
   "After each step, take a screenshot and carefully evaluate if you have achieved the right outcome.
   Explicitly show your thinking: 'I have evaluated step X...' If not correct, try again.
   Only when you confirm a step was executed correctly should you move on to the next one."

   COORDINATE IDENTIFICATION (CRITICAL):
   - Screenshot is ~1429px wide. Identify X position as percentage, then calculate.
   - LEFT EDGE = x:0, CENTER = x:715, RIGHT EDGE = x:1429
   - YouTube layout: Sidebar (x:0-170), Videos start at x:200+
   - To click a video thumbnail on YouTube: x should be 300-600 range (NOT 683 which hits sidebar)
   - ALWAYS state: "The element I want is at approximately X% across the screen = [calculated x, y]"

   EXAMPLES:
   - "Play X on YouTube":
     1. bash 'open "https://youtube.com/results?search_query=X"'
     2. wait 2s
     3. screenshot
     4. USE KEYBOARD: Press Tab 3-4 times to focus first video, then press Return
     (Keyboard is MORE RELIABLE than clicking for YouTube)
   - Alternative click method: Find video thumbnail, note it's at ~25% from left (x≈350) and ~40% from top (y≈320)
   - "Click Submit button": screenshot → state exact position "Submit is at x≈[num], y≈[num]" → click

   KEYBOARD SHORTCUTS (use for dropdowns, scrollbars, tricky UI):
   - cmd+l: Focus browser URL bar
   - Tab/Shift+Tab: Navigate form fields
   - Return: Submit/confirm
   - Escape: Cancel/close
   - cmd+w: Close window

9. PROACTIVITY:
   - Don't ask unless blocked by auth/biometrics.
   - App not open? bash 'open -a "AppName"'
   - Click failed? Try keyboard shortcut instead.

AGENTIC WORKFLOW (gather context -> take action -> verify):
1. Analyze: Understand the request. Break complex tasks into steps.
2. Explore: Find relevant files (list, grep, glob).
3. Read: Load content completely before editing.
4. Plan: For complex changes, create a mental plan. In plan mode, output it explicitly.
5. Act: Execute changes (edit, write, bash). Chain multiple tools when needed.
6. Verify: Check your work (run tests, check for errors, review output).
7. Self-Correct: If something fails, analyze the error and try a different approach.

Current Working Directory: ${cfg.workspaceRoot}
${userContext ? `\n${userContext}\n` : ''}
CAPABILITIES:

Active (Ready to use):
${activeList}

${offlineList ? `Offline (Configured but disconnected):\n${offlineList}\n` : ''}
${registryList ? `Installable (New capabilities):\n${registryList}\n` : ''}
MEMORY:
- Use the 'memory' tool to store important user information (name, preferences, project facts).
- When the user shares personal info (name, preferences), store it immediately using memory tool.
- Recall stored memories to personalize interactions.`,
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

                    if (accurateUsage > CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_STOP) {
                        bus.emitAgent({
                            type: 'error',
                            message: `[Context] Message would use ${(accurateUsage / 1000).toFixed(1)}k tokens (limit: ${(CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_STOP / 1000).toFixed(0)}k). Run /clear or auto-pruning.`
                        });
                        // Auto-prune and retry
                        await this.compressHistory();
                        return await this.streamChat(userMessage, options);
                    }

                    if (accurateUsage > CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_PRUNE) {
                        bus.emitAgent({
                            type: 'thought',
                            content: `[Context] Pre-check: ${(accurateUsage / 1000).toFixed(1)}k tokens (${((accurateUsage / CONTEXT.MAX_TOKENS_TOTAL) * 100).toFixed(0)}%). Pruning before send.`,
                            hidden: false
                        });
                        await this.compressHistory();
                    } else if (accurateUsage > CONTEXT.MAX_TOKENS_TOTAL * CONTEXT.TOKEN_LIMIT_WARN) {
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

            this.currentInterruptHandler = (e: any) => {
                if (e.type === 'user_interrupt' && this.abortController) {
                    this.abortController.abort();
                    bus.emitAgent({ type: 'thought', content: '[Stop] Interrupted by user.' });
                }
            };

            bus.on('user', this.currentInterruptHandler);

            // Apply caching to the last message if it's a checkpoint
            // We set a checkpoint every 5 turns (interactions)
            if (this.conversationHistory.length > 0 && this.conversationHistory.length % 5 === 0) {
                const lastMsg = this.conversationHistory[this.conversationHistory.length - 1];
                if (lastMsg.content) {
                    // Check if it's a user or assistant message that supports content blocks
                    // Ideally we cache on User messages (checkpoints)
                    if (lastMsg.role === 'user' && typeof lastMsg.content === 'string') {
                        lastMsg.content = [
                            { type: 'text', text: lastMsg.content, cache_control: { type: 'ephemeral' } }
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
                    stream: true as const,
                };

                // Enable Adaptive Thinking for Opus 4.6
                if (isOpus46) {
                    baseParams.thinking = {
                        type: 'enabled',
                        budget_tokens: Math.floor((this.lastConfig?.maxTokens || 8192) / 2),
                        effort: this.lastConfig?.thinkingEffort || 'high'
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

                    return await this.client!.beta.messages.create({
                        ...baseParams,
                        system: [enhancedSystemBlock],
                        betas: [betaFlag],
                        stream: true as const,
                    }, { signal }) as any;
                }

                // Standard API call
                return await this.client!.messages.create(baseParams, { signal }) as any;
            };

            let stream: any;
            let currentModel = apiModel;
            let inputTokens = 0;
            let outputTokens = 0;
            let cacheReadTokens = 0;
            let cacheCreationTokens = 0;

            try {
                stream = await createMessage(apiModel);
            } catch (error: any) {
                // Check if it's a model availability error (404 or string match)
                const isNotFound = error.status === 404 ||
                    (error.message && error.message.includes('not_found_error')) ||
                    (error.error && error.error.type === 'not_found_error');

                // Check if it's a corrupted history error (orphaned tool_use/tool_result)
                const isHistoryCorruption = error.status === 400 &&
                    (error.message?.includes('tool_use_id') || error.message?.includes('tool_result') ||
                        error.error?.message?.includes('tool_use_id') || error.error?.message?.includes('tool_result'));

                if (isHistoryCorruption) {
                    bus.emitAgent({
                        type: 'thought',
                        content: '[Context] Detected corrupted history - clearing and retrying...',
                        hidden: false
                    });
                    // Clear corrupted history and retry with just the current message
                    this.conversationHistory = [{
                        role: 'user',
                        content: userMessage || 'Continue from where we left off.'
                    }];
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
            let toolUses: ToolUsePartial[] = [];
            let currentToolUse: ToolUsePartial | null = null;
            let currentThinking: any = null;

            for await (const chunk of stream) {
                if (chunk.type === 'message_start' && chunk.message && chunk.message.usage) {
                    inputTokens += chunk.message.usage.input_tokens || 0;
                    outputTokens += chunk.message.usage.output_tokens || 0;

                    // Track Cache Metrics
                    // @ts-ignore - SDK types might trail API updates
                    if (chunk.message.usage.cache_read_input_tokens) {
                        cacheReadTokens += chunk.message.usage.cache_read_input_tokens;
                        this.accumulatedCacheReadTokens += chunk.message.usage.cache_read_input_tokens;
                    }
                    // @ts-ignore
                    if (chunk.message.usage.cache_creation_input_tokens) {
                        cacheCreationTokens += chunk.message.usage.cache_creation_input_tokens;
                        this.accumulatedCacheCreationTokens += chunk.message.usage.cache_creation_input_tokens;
                    }

                    this.accumulatedInputTokens += inputTokens;
                    this.accumulatedOutputTokens += outputTokens;
                }

                if (chunk.type === 'message_delta' && chunk.usage) {
                    outputTokens += chunk.usage.output_tokens || 0;
                    this.accumulatedOutputTokens += chunk.usage.output_tokens || 0;
                }

                if (chunk.type === 'content_block_start' && chunk.content_block.type === 'thinking') {
                    currentThinking = { type: 'thinking' };
                }

                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'thinking_delta') {
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

                if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
                    currentToolUse = {
                        id: chunk.content_block.id,
                        name: chunk.content_block.name,
                        input: ''
                    };
                }

                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'input_json_delta') {
                    if (currentToolUse) {
                        currentToolUse.input += chunk.delta.partial_json;
                    }
                }

                if (chunk.type === 'content_block_stop' && currentToolUse) {
                    try {
                        currentToolUse.input = JSON.parse(currentToolUse.input);
                        toolUses.push(currentToolUse);
                        currentToolUse = null;
                    } catch (e) {
                        // ignore parse error mid-stream
                    }
                }

                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
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
                        // Handle Anthropic-defined tools
                        // Note: Coordinate scaling is now handled in ComputerUseTool (tools.ts)
                        // This ensures scaling works both with and without pilot mode
                        if (this.computerUseState.enabled && toolUse.name === 'computer') {
                            result = await tools.execute('computer', toolUse.input);
                        } else if (this.computerUseState.enabled && toolUse.name === 'str_replace_based_edit_tool') {
                            // Map Anthropic text_editor to our edit tool
                            const cmd = toolUse.input.command;
                            if (cmd === 'view') {
                                result = await tools.execute('read', { path: toolUse.input.path });
                            } else if (cmd === 'create') {
                                result = await tools.execute('write', {
                                    path: toolUse.input.path,
                                    content: toolUse.input.file_text || ''
                                });
                            } else if (cmd === 'str_replace') {
                                result = await tools.execute('edit', {
                                    path: toolUse.input.path,
                                    search: toolUse.input.old_str,
                                    replace: toolUse.input.new_str
                                });
                            } else {
                                result = { success: false, error: `Unknown editor command: ${cmd}` };
                            }
                        } else if (this.computerUseState.enabled && toolUse.name === 'bash') {
                            // Anthropic bash tool - pass through to our bash tool
                            result = await tools.execute('bash', { command: toolUse.input.command });
                        } else {
                            // Standard tool execution
                            result = await tools.execute(toolUse.name, toolUse.input);
                        }
                    } catch (toolError: any) {
                        console.error(`[LLM] Tool execution error for ${toolUse.name}:`, toolError);
                        result = { success: false, error: `Tool execution failed: ${toolError.message}` };
                    }

                    // Redact PII
                    let outputContent = result.success ? (result.output || 'Success') : (result.error || 'Failed');
                    const redactionResult = redactor.redactToolOutput(toolUse.name, outputContent);

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
                        outputContent = outputContent.slice(0, 5000) + `\n... [${outputContent.length - 10000} chars truncated] ...\n` + outputContent.slice(-5000);
                    }

                    let toolResultContent: any = outputContent;

                    // If we have structured content (like image blocks), use them
                    if (result.content && Array.isArray(result.content)) {
                        toolResultContent = result.content.map((block: any) => {
                            if (block.type === 'image') {
                                return {
                                    type: 'image',
                                    source: {
                                        type: 'base64',
                                        media_type: block.mimeType || 'image/png',
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
                    }
                }

                // Add assistant message with tool uses to history
                this.conversationHistory.push({
                    role: 'assistant',
                    content: [
                        ...(fullThinking ? [{ type: 'thinking' as any, thinking: fullThinking }] : []),
                        ...(fullResponse ? [{ type: 'text' as const, text: fullResponse }] : []),
                        ...toolUses.map(tu => ({
                            type: 'tool_use' as const,
                            id: tu.id,
                            name: tu.name,
                            input: tu.input
                        }))
                    ] as any
                });

                // Add context budget warning if approaching limits (like Claude Code)
                const postToolUsage = usage.getContextUsage(currentModel);
                const postToolPercent = (postToolUsage.used / CONTEXT.MAX_TOKENS_TOTAL) * 100;

                // Inject system warning as text block instead of fake tool_result
                // (tool_result requires matching tool_use which would cause API errors)
                let systemWarning: Anthropic.TextBlockParam | null = null;
                if (postToolPercent > 70) {
                    systemWarning = {
                        type: 'text',
                        text: `<system_warning>Token usage: ${postToolUsage.used}/${CONTEXT.MAX_TOKENS_TOTAL}; ${postToolUsage.remaining} remaining</system_warning>`,
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
                        ...(fullThinking ? [{ type: 'thinking' as any, thinking: fullThinking }] : []),
                        ...(fullResponse ? [{ type: 'text' as any, text: fullResponse }] : [])
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

        } catch (error: any) {
            if (error.name === 'AbortError' || error.type === 'aborted') {
                return null;
            }
            // Log detailed error for debugging
            const errorDetails = error.status
                ? `[${error.status}] ${error.message}`
                : error.message || String(error);
            bus.emitAgent({
                type: 'error',
                message: `LLM Error: ${errorDetails}`
            });
            // Log to console for debugging
            console.error('[LLM] API Error:', error);
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
            if (this.conversationHistory.length < CONTEXT.MAX_MESSAGES + CONTEXT.BUFFER) return;

            // Identify the block to summarize
            const summarizeStart = CONTEXT.KEEP_FIRST;
            const summarizeEnd = this.conversationHistory.length - CONTEXT.KEEP_LAST;
            const messagesToSummarize = this.conversationHistory.slice(summarizeStart, summarizeEnd);

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
                    const { memory } = await import('./memory.js');
                    await memory.store('daily_summary', `context_compression_${Date.now()}`, summary);
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

    private async summarizeBlock(messages: Anthropic.MessageParam[]): Promise<string> {
        if (!this.client) return "Summary unavailable.";

        const summarizerModel = this.lastConfig?.summarizerModel || 'claude-haiku-4-5-20251001';

        // Prepare messages for the summarizer
        // We simple convert `tool_use` / `tool_result` to text representations to avoid complex tool definitions for the summarizer
        const simplifiedMessages: Anthropic.MessageParam[] = messages.map(m => {
            if (Array.isArray(m.content)) {
                // Flatten content blocks to text
                const textContent = m.content.map(b => {
                    if (b.type === 'text') return b.text;
                    if (b.type === 'tool_use') return `[Tool Use: ${b.name}]`;
                    if (b.type === 'tool_result') return `[Tool Result: ${typeof b.content === 'string' ? b.content.slice(0, 500) + '...' : 'Data'}]`; // Truncate tool results heavily
                    return '';
                }).join('\n');
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
            messages: [{ role: 'user', content: prompt }],
        });

        if (response.content[0].type === 'text') {
            return response.content[0].text;
        }
        return "Summary generation returned non-text content.";
    }

    private pruneHistoryFallback() {
        // Original pruning logic (Moved here as fallback)
        if (this.conversationHistory.length > CONTEXT.MAX_MESSAGES) {
            const keepFirst = CONTEXT.KEEP_FIRST;
            const keepLast = 20; // Keep slightly more for safety in fallback

            const removalCount = this.conversationHistory.length - (keepFirst + keepLast);
            if (removalCount > 0) {
                const keptStart = this.conversationHistory.slice(0, keepFirst);
                const keptEnd = this.conversationHistory.slice(-keepLast);

                this.conversationHistory = [
                    ...keptStart,
                    { role: 'user', content: `[... History Pruned: ${removalCount} intermediate messages were removed to save context ...]` },
                    ...keptEnd
                ];
            }
        }
    }

    clearHistory(): void {
        this.conversationHistory = [];
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
        const { context } = await import('./context.js');
        const { db } = await import('./database.js');

        const sessionId = context.get().session_id;
        if (!sessionId) return;

        try {
            db.getDb().prepare('UPDATE sessions SET llm_history = ? WHERE id = ?')
                .run(JSON.stringify(this.conversationHistory), sessionId);
        } catch (e) {
            console.error('Failed to persist LLM history:', e);
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
                const toolResults = (msg.content as any[]).filter((b: any) => b.type === 'tool_result');

                if (toolResults.length > 0) {
                    // Must have a previous assistant message with matching tool_uses
                    if (!prevMsg || prevMsg.role !== 'assistant' || !Array.isArray(prevMsg.content)) {
                        return false;
                    }

                    const toolUseIds = new Set(
                        (prevMsg.content as any[])
                            .filter((b: any) => b.type === 'tool_use')
                            .map((b: any) => b.id)
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
    private validateAndFixHistory(history: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
        const validated: Anthropic.MessageParam[] = [];

        for (let i = 0; i < history.length; i++) {
            const msg = history[i];
            const nextMsg = history[i + 1];
            const prevMsg = validated[validated.length - 1];

            // Check if this message contains tool_result blocks (user message after assistant tool_use)
            if (msg.role === 'user' && Array.isArray(msg.content)) {
                const toolResultBlocks = (msg.content as any[]).filter((b: any) => b.type === 'tool_result');

                if (toolResultBlocks.length > 0) {
                    // Check if previous message has corresponding tool_uses
                    if (!prevMsg || prevMsg.role !== 'assistant' || !Array.isArray(prevMsg.content)) {
                        // No valid tool_use precedes - strip tool_result blocks
                        const nonToolBlocks = (msg.content as any[]).filter((b: any) => b.type !== 'tool_result');
                        if (nonToolBlocks.length > 0) {
                            validated.push({
                                role: 'user',
                                content: nonToolBlocks
                            });
                        }
                        continue;
                    }

                    // Get tool_use IDs from previous assistant message
                    const toolUseIds = new Set(
                        (prevMsg.content as any[])
                            .filter((b: any) => b.type === 'tool_use')
                            .map((b: any) => b.id)
                    );

                    // Filter to only valid tool_results
                    const validToolResults = toolResultBlocks.filter((tr: any) => toolUseIds.has(tr.tool_use_id));
                    const nonToolBlocks = (msg.content as any[]).filter((b: any) => b.type !== 'tool_result');

                    if (validToolResults.length !== toolResultBlocks.length) {
                        // Some tool_results are orphaned - reconstruct message with only valid ones
                        if (validToolResults.length === 0 && nonToolBlocks.length > 0) {
                            validated.push({
                                role: 'user',
                                content: nonToolBlocks
                            });
                            continue;
                        } else if (validToolResults.length > 0) {
                            validated.push({
                                role: 'user',
                                content: [...nonToolBlocks, ...validToolResults]
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
                const toolUseBlocks = (msg.content as any[]).filter((b: any) => b.type === 'tool_use');

                if (toolUseBlocks.length > 0) {
                    // Check if next message has corresponding tool_results
                    if (!nextMsg || nextMsg.role !== 'user' || !Array.isArray(nextMsg.content)) {
                        // No valid tool_result follows - strip tool_use blocks from this message
                        const textBlocks = (msg.content as any[]).filter((b: any) => b.type === 'text');
                        if (textBlocks.length > 0) {
                            validated.push({
                                role: 'assistant',
                                content: textBlocks.map((b: any) => b.text).join('\n')
                            });
                        }
                        continue;
                    }

                    // Verify each tool_use has a matching tool_result
                    const toolResultIds = new Set(
                        (nextMsg.content as any[])
                            .filter((b: any) => b.type === 'tool_result')
                            .map((b: any) => b.tool_use_id)
                    );

                    const validToolUses = toolUseBlocks.filter((tu: any) => toolResultIds.has(tu.id));

                    if (validToolUses.length !== toolUseBlocks.length) {
                        // Some tool_uses are orphaned - reconstruct message with only valid ones
                        const textBlocks = (msg.content as any[]).filter((b: any) => b.type === 'text');
                        if (validToolUses.length === 0 && textBlocks.length > 0) {
                            validated.push({
                                role: 'assistant',
                                content: textBlocks.map((b: any) => b.text).join('\n')
                            });
                            continue;
                        } else if (validToolUses.length > 0) {
                            validated.push({
                                role: 'assistant',
                                content: [...textBlocks, ...validToolUses]
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
