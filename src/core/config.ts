import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { z } from 'zod';
<<<<<<< HEAD
import dotenv from 'dotenv';

dotenv.config();

export const ConfigSchema = z.object({
    apiKey: z.string().optional(),
=======

// NOTE: API keys are managed exclusively by KeyManager (src/core/keyManager.ts)
// Do not store API keys in config - use /init to set up secure key storage

export const ConfigSchema = z.object({
>>>>>>> polyoxy-dev/v0.4.0-mcp
    model: z.string().default('claude-sonnet-4-5-20250929'),
    workspaceRoot: z.string().default(process.cwd()),
    maxTokens: z.number().default(8192),
    language: z.string().default('en'),
<<<<<<< HEAD
=======
    // Deprecated: apiKey should be managed by KeyManager, not stored in config
    apiKey: z.string().optional(),
>>>>>>> polyoxy-dev/v0.4.0-mcp
});

export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_CONFIG: Config = {
<<<<<<< HEAD
    model: 'claude-3-5-sonnet',
    maxTokens: 4096,
=======
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 8192,
>>>>>>> polyoxy-dev/v0.4.0-mcp
    language: 'en',
    workspaceRoot: process.cwd(),
};

export class ConfigManager {
    private configPath: string;
    private cachedConfig: Config | null = null;
<<<<<<< HEAD
=======
    private hasDeprecatedApiKey: boolean = false;
>>>>>>> polyoxy-dev/v0.4.0-mcp

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
<<<<<<< HEAD
=======

            // Warn if deprecated apiKey found in config file
            if (parsed.apiKey) {
                this.hasDeprecatedApiKey = true;
            }
>>>>>>> polyoxy-dev/v0.4.0-mcp
        } catch {
            // File missing or invalid, use defaults
        }

<<<<<<< HEAD
        const envKey = process.env.ANTHROPIC_API_KEY;

        const finalConfig = ConfigSchema.parse({
            ...loadedConfig,
            apiKey: envKey || loadedConfig.apiKey
        });
=======
        const finalConfig = ConfigSchema.parse(loadedConfig);
>>>>>>> polyoxy-dev/v0.4.0-mcp

        this.cachedConfig = finalConfig;
        return finalConfig;
    }

<<<<<<< HEAD
=======
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

>>>>>>> polyoxy-dev/v0.4.0-mcp
    clearCache(): void {
        this.cachedConfig = null;
    }

    async save(config: Config): Promise<void> {
        const dir = path.dirname(this.configPath);
        await fs.mkdir(dir, { recursive: true });
<<<<<<< HEAD
        await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
=======

        // Never save apiKey to config file - use KeyManager instead
        const { apiKey, ...safeConfig } = config;

        await fs.writeFile(this.configPath, JSON.stringify(safeConfig, null, 2));
>>>>>>> polyoxy-dev/v0.4.0-mcp
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
