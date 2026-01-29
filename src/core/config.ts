import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env if present
dotenv.config();

export const ConfigSchema = z.object({
    model: z.enum(['claude-3-5-sonnet', 'claude-3-opus', 'ollama']).default('claude-3-5-sonnet'),
    maxTokens: z.number().default(4096),
    language: z.string().default('en'),
    apiKey: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_CONFIG: Config = {
    model: 'claude-3-5-sonnet',
    maxTokens: 4096,
    language: 'en',
};

export class ConfigManager {
    private configPath: string;
    private cachedConfig: Config | null = null;

    constructor(customPath?: string) {
        this.configPath = customPath || path.join(os.homedir(), '.obsidian', 'config.json');
    }

    async load(): Promise<Config> {
        // Return cached if available
        if (this.cachedConfig) return this.cachedConfig;

        let loadedConfig = DEFAULT_CONFIG;

        try {
            const data = await fs.readFile(this.configPath, 'utf-8');
            const parsed = JSON.parse(data);
            loadedConfig = { ...DEFAULT_CONFIG, ...parsed };
        } catch (error) {
            // Use defaults if file missing
        }

        // Validate and merge with Env Vars
        // Env var takes precedence for API Key if not explicitly set in config, or overrides it? 
        // Usually Env Var > Config File > Default
        const envKey = process.env.ANTHROPIC_API_KEY;

        const finalConfig = ConfigSchema.parse({
            ...loadedConfig,
            apiKey: envKey || loadedConfig.apiKey
        });

        this.cachedConfig = finalConfig;
        return finalConfig;
    }

    async save(config: Config): Promise<void> {
        const dir = path.dirname(this.configPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
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
