import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { z } from 'zod';

// NOTE: API keys are managed exclusively by KeyManager (src/core/keyManager.ts)
// Do not store API keys in config - use /init to set up secure key storage

export const ConfigSchema = z.object({
    model: z.string().default('claude-sonnet-4-5-20250929'),
    workspaceRoot: z.string().default(process.cwd()),
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
});

export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_CONFIG: Config = {
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 8192,
    language: 'en',
    workspaceRoot: process.cwd(),
    executionMode: 'local',
    sandbox: {
        allowedDomains: ['*.github.com', '*.npmjs.org', '*.npmjs.com', 'api.anthropic.com', 'registry.npmjs.org'],
        deniedDomains: [],
        denyRead: ['~/.ssh', '~/.aws', '~/.config/gcloud', '~/.kube', '~/.gnupg'],
        allowWrite: ['.', '/tmp'],
        denyWrite: ['.env', '.env.*', '*.key', '*.pem', '.git/config'],
    },
};

export class ConfigManager {
    private configPath: string;
    private cachedConfig: Config | null = null;
    private hasDeprecatedApiKey: boolean = false;

    constructor(customPath?: string) {
        this.configPath = customPath || path.join(os.homedir(), '.obsidian', 'config.json');
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
        const { apiKey, ...safeConfig } = config;

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
}

export const config = new ConfigManager();
