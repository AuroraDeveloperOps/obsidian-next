/**
 * Obsidian Next - Sandbox Runtime Integration
 * OS-level sandboxing for secure tool execution
 */

import { bus } from './bus.js';
import { config } from './config.js';

// Types from sandbox-runtime (may need adjustment based on actual package exports)
interface SandboxRuntimeConfig {
    network?: {
        allowedDomains?: string[];
        deniedDomains?: string[];
    };
    filesystem?: {
        denyRead?: string[];
        allowWrite?: string[];
        denyWrite?: string[];
    };
}

type ExecutionMode = 'local' | 'sandbox';

interface SandboxConfig {
    mode: ExecutionMode;
    allowedDomains: string[];
    deniedDomains: string[];
    denyRead: string[];
    allowWrite: string[];
    denyWrite: string[];
}

// Default sandbox configuration
const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
    mode: 'local',
    allowedDomains: [
        '*.github.com',
        '*.npmjs.org',
        '*.npmjs.com',
        'api.anthropic.com',
        'registry.npmjs.org',
    ],
    deniedDomains: [],
    denyRead: [
        '~/.ssh',
        '~/.aws',
        '~/.config/gcloud',
        '~/.kube',
        '~/.gnupg',
    ],
    allowWrite: [
        '.', // Current workspace
        '/tmp',
    ],
    denyWrite: [
        '.env',
        '.env.*',
        '*.key',
        '*.pem',
        '.git/config',
    ],
};

/**
 * SandboxExecutor - Manages sandbox mode for tool execution
 */
export class SandboxExecutor {
    private initialized = false;
    private mode: ExecutionMode = 'local';
    private sandboxManager: any = null;
    private config: SandboxConfig = DEFAULT_SANDBOX_CONFIG;

    /**
     * Initialize sandbox with configuration
     */
    async initialize(): Promise<boolean> {
        try {
            const cfg = await config.load();

            // Check if sandbox mode is requested
            this.mode = (cfg as any).executionMode || 'local';
            this.config = {
                ...DEFAULT_SANDBOX_CONFIG,
                ...((cfg as any).sandbox || {}),
            };

            if (this.mode !== 'sandbox') {
                this.initialized = true;
                return true;
            }

            // Try to load sandbox-runtime
            try {
                const { SandboxManager } = await import('@anthropic-ai/sandbox-runtime');

                const runtimeConfig: SandboxRuntimeConfig = {
                    network: {
                        allowedDomains: this.config.allowedDomains,
                        deniedDomains: this.config.deniedDomains,
                    },
                    filesystem: {
                        denyRead: this.config.denyRead,
                        allowWrite: this.config.allowWrite,
                        denyWrite: this.config.denyWrite,
                    },
                };

                await SandboxManager.initialize(runtimeConfig);
                this.sandboxManager = SandboxManager;
                this.initialized = true;

                bus.emitAgent({
                    type: 'thought',
                    content: '[SANDBOX] Initialized with OS-level isolation',
                });

                return true;
            } catch (importError: any) {
                // Sandbox runtime not available, fall back to local mode
                bus.emitAgent({
                    type: 'error',
                    message: `Sandbox runtime unavailable: ${importError.message}. Using local mode.`,
                });

                this.mode = 'local';
                this.initialized = true;
                return true;
            }
        } catch (error: any) {
            bus.emitAgent({
                type: 'error',
                message: `Sandbox initialization failed: ${error.message}`,
            });
            return false;
        }
    }

    /**
     * Wrap a command with sandbox protection
     */
    async wrapCommand(command: string): Promise<string> {
        if (!this.initialized) {
            await this.initialize();
        }

        // Local mode - return command as-is
        if (this.mode === 'local' || !this.sandboxManager) {
            return command;
        }

        // Sandbox mode - wrap with sandbox-exec/bubblewrap
        try {
            return await this.sandboxManager.wrapWithSandbox(command);
        } catch (error: any) {
            bus.emitAgent({
                type: 'error',
                message: `Sandbox wrap failed: ${error.message}. Running without sandbox.`,
            });
            return command;
        }
    }

    /**
     * Get current execution mode
     */
    getMode(): ExecutionMode {
        return this.mode;
    }

    /**
     * Set execution mode
     */
    async setMode(mode: ExecutionMode): Promise<void> {
        this.mode = mode;

        if (mode === 'sandbox' && !this.sandboxManager) {
            await this.initialize();
        }

        bus.emitAgent({
            type: 'thought',
            content: `[SANDBOX] Execution mode set to: ${mode}`,
        });
    }

    /**
     * Get current sandbox configuration
     */
    getConfig(): SandboxConfig {
        return { ...this.config };
    }

    /**
     * Update sandbox configuration
     */
    updateConfig(updates: Partial<SandboxConfig>): void {
        this.config = { ...this.config, ...updates };
    }

    /**
     * Reset and cleanup sandbox resources
     */
    async reset(): Promise<void> {
        if (this.sandboxManager) {
            try {
                await this.sandboxManager.reset();
            } catch {
                // Ignore cleanup errors
            }
        }
        this.initialized = false;
        this.sandboxManager = null;
    }

    /**
     * Check if sandbox mode is available on this system
     */
    async isAvailable(): Promise<boolean> {
        try {
            await import('@anthropic-ai/sandbox-runtime');
            return true;
        } catch {
            return false;
        }
    }
}

export const sandbox = new SandboxExecutor();
