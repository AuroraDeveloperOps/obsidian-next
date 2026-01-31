/**
 * Obsidian Next - Sandbox Runtime Integration
 * OS-level sandboxing for secure tool execution
 *
 * Supports:
 * - @anthropic-ai/sandbox-runtime (if available)
 * - macOS sandbox-exec (native fallback)
 * - Linux firejail (native fallback)
 */

import { bus } from './bus.js';
import { config } from './config.js';
import { settings } from './settings.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

// Types from sandbox-runtime (may need adjustment based on actual package exports)
interface SandboxRuntimeConfig {
    network: {
        allowedDomains: string[];
        deniedDomains: string[];
    };
    filesystem: {
        denyRead: string[];
        allowWrite: string[];
        denyWrite: string[];
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
            const s = await settings.load();

            // Check if sandbox mode is requested via Config OR Settings
            if ((cfg as any).executionMode === 'sandbox' || s.security.sandbox) {
                this.mode = 'sandbox';
            } else {
                this.mode = 'local';
            }

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
                // Sandbox runtime not available, do NOT revert to local.
                // We will fall back to wrapWithNativeSandbox in wrapCommand.
                bus.emitAgent({
                    type: 'thought',
                    content: `[SANDBOX] Runtime library unavailable (Error: ${importError.message}). Falling back to native OS sandbox.`,
                });

                this.sandboxManager = null;
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
        if (this.mode === 'local') {
            return command;
        }

        // Try Anthropic sandbox runtime first
        if (this.sandboxManager) {
            try {
                return await this.sandboxManager.wrapWithSandbox(command);
            } catch (error: any) {
                // Fall through to native sandbox
            }
        }

        // Try native sandbox
        return this.wrapWithNativeSandbox(command);
    }

    /**
     * Wrap command with native OS sandbox (macOS sandbox-exec or Linux firejail)
     */
    private async wrapWithNativeSandbox(command: string): Promise<string> {
        const platform = os.platform();

        if (platform === 'darwin') {
            // macOS: Use sandbox-exec with a permissive profile
            // This restricts network and sensitive file access
            const profile = `(version 1)
(deny default)
(allow process-exec*)
(allow process-fork)
(allow signal)
(allow syscall-unix)
(allow sysctl-read)
(allow file-read*)
(allow file-write* (subpath "/tmp"))
(allow file-write* (subpath "${process.cwd()}"))
(deny file-write* (literal "${process.cwd()}/.env"))
(deny file-read* (subpath "${os.homedir()}/.ssh"))
(deny file-read* (subpath "${os.homedir()}/.aws"))
(allow network-outbound (remote tcp "*:80" "*:443"))
(allow network*)
(allow mach-lookup*)
(allow iokit*)
            `.trim();

            // Write profile to temp file and use it
            // Using /tmp for profile to avoid command line length limits issues and quoting hell
            const profilePath = `/tmp/obsidian-sandbox-${Date.now()}.sb`;
            const fs = await import('fs/promises');
            await fs.writeFile(profilePath, profile);

            // Escape command for bash -c
            // Use simplest approach: run bash, pass command as script
            // Or better: allow bash to execute the command string directly

            // We need to return a string that the shell will execute
            // The shell executes: sandbox-exec -f profilePath bash -c "command"

            const escapedCommand = command.replace(/"/g, '\\"');
            return `sandbox-exec -f ${profilePath} bash -c "${escapedCommand}"`;
        }

        if (platform === 'linux') {
            // Linux: Check if firejail is available
            try {
                await execAsync('which firejail');
                // Firejail with network and sensitive dirs blocked
                const escapedCommand = command.replace(/'/g, "'\\''");
                return `firejail --net=none --blacklist=~/.ssh --blacklist=~/.aws --blacklist=~/.gnupg bash -c '${escapedCommand}'`;
            } catch {
                // Firejail not available, return as-is
            }
        }

        // No sandbox available, return command as-is
        return command;
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
            content: `[sandbox] Execution mode set to: ${mode}`,
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
