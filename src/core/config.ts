import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { z } from 'zod';

// NOTE: API keys are managed exclusively by KeyManager (src/core/keyManager.ts)
// Do not store API keys in config - use /init to set up secure key storage

export const ConfigSchema = z.object({
    model: z.string().default('claude-sonnet-4-5-20250929'),
    workspaceRoot: z.string().default(os.homedir()),
    maxTokens: z.number().default(8192),
    language: z.string().default('en'),
    // Deprecated: apiKey should be managed by KeyManager, not stored in config
    apiKey: z.string().optional(),

    // Sandbox Configuration
    executionMode: z.enum(['local', 'sandbox']).default('local'),
    sandbox: z.object({
        allowedDomains: z.array(z.string()).default(['*.github.com', '*.npmjs.org', '*.npmjs.com', 'api.anthropic.com', 'registry.npmjs.org']),
        deniedDomains: z.array(z.string()).default([]),
        denyRead: z.array(z.string()).default(['~/.ssh', '~/.aws', '~/.config/gcloud', '~/.kube', '~/.gnupg']),
        allowWrite: z.array(z.string()).default(['.', '/tmp']),
        denyWrite: z.array(z.string()).default(['.env', '.env.*', '*.key', '*.pem', '.git/config']),
    }).default({}),

    // Context Management
    summarizerModel: z.string().default('claude-haiku-4-5-20251001'),

    // Token Counting
    // When true, uses Anthropic's countTokens API for accurate pre-request validation
    // Set to false to skip pre-counting (saves ~100-500ms latency per request)
    preCountTokens: z.boolean().default(true),
});

export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_CONFIG: Config = {
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 8192,
    language: 'en',
    workspaceRoot: os.homedir(),
    executionMode: 'local',
    sandbox: {
        allowedDomains: ['*.github.com', '*.npmjs.org', '*.npmjs.com', 'api.anthropic.com', 'registry.npmjs.org'],
        deniedDomains: [],
        denyRead: ['~/.ssh', '~/.aws', '~/.config/gcloud', '~/.kube', '~/.gnupg'],
        allowWrite: ['.', '/tmp'],
        denyWrite: ['.env', '.env.*', '*.key', '*.pem', '.git/config'],
    },
    summarizerModel: 'claude-haiku-4-5-20251001',
    preCountTokens: true,
};

export class ConfigManager {
    private configPath: string;
    private cachedConfig: Config | null = null;
    private hasDeprecatedApiKey: boolean = false;

    constructor(customPath?: string) {
        this.configPath = customPath || path.join(os.homedir(), '.obsidian-next', 'config.json');
    }

    async load(): Promise<Config> {
        // Return cached if available
        if (this.cachedConfig) return this.cachedConfig;

        return this.reload();
    }

    async reload(): Promise<Config> {
        let loadedConfig = DEFAULT_CONFIG;

        try {
            const data = await fs.readFile(this.configPath, 'utf-8');
            const parsed = JSON.parse(data);
            loadedConfig = { ...DEFAULT_CONFIG, ...parsed };

            // Warn if deprecated apiKey found in config file
            if (parsed.apiKey) {
                this.hasDeprecatedApiKey = true;
            }
        } catch {
            // File missing or invalid, use defaults
        }

        const finalConfig = ConfigSchema.parse(loadedConfig);

        this.cachedConfig = finalConfig;
        return finalConfig;
    }

    /**
     * Check if config has deprecated apiKey field
     * Users should migrate to KeyManager via /init
     */
    hasDeprecatedKey(): boolean {
        return this.hasDeprecatedApiKey;
    }

    /**
     * Get deprecated apiKey for migration to KeyManager
     */
    getDeprecatedApiKey(): string | undefined {
        return this.cachedConfig?.apiKey;
    }

    /**
     * Remove apiKey from config file after successful migration
     */
    async removeApiKeyFromConfig(): Promise<void> {
        try {
            const data = await fs.readFile(this.configPath, 'utf-8');
            const parsed = JSON.parse(data);

            if (parsed.apiKey) {
                delete parsed.apiKey;
                await fs.writeFile(this.configPath, JSON.stringify(parsed, null, 2));
                this.hasDeprecatedApiKey = false;
                this.clearCache();
            }
        } catch {
            // Config file may not exist
        }
    }

    clearCache(): void {
        this.cachedConfig = null;
    }

    async save(config: Config): Promise<void> {
        const dir = path.dirname(this.configPath);
        await fs.mkdir(dir, { recursive: true });

        // Never save apiKey to config file - use KeyManager instead
        // Never save workspaceRoot to global config - it should always be process.cwd() or set by local config
        const { apiKey, workspaceRoot, ...safeConfig } = config;

        await fs.writeFile(this.configPath, JSON.stringify(safeConfig, null, 2));
        this.clearCache();
    }

    async exists(): Promise<boolean> {
        try {
            await fs.access(this.configPath);
            return true;
        } catch {
            return false;
        }
    }

    getPath(): string {
        return this.configPath;
    }

    /**
     * Dynamically get the project version from package.json
     */
    async getVersion(): Promise<string> {
        try {
            const selfPath = fileURLToPath(import.meta.url);
            let currentDir = path.dirname(selfPath);

            // Search upwards for package.json
            for (let i = 0; i < 5; i++) {
                const pkgPath = path.join(currentDir, 'package.json');
                try {
                    const data = await fs.readFile(pkgPath, 'utf-8');
                    const pkg = JSON.parse(data);
                    if (pkg.name === '@aurora-foundation/obsidian-next') {
                        return pkg.version;
                    }
                } catch {
                    // Not in this dir, go up
                }
                currentDir = path.dirname(currentDir);
            }
            return '0.4.5'; // Fallback
        } catch {
            return '0.4.5';
        }
    }
}

export const config = new ConfigManager();
