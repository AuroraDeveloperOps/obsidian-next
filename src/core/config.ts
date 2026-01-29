import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export const ConfigSchema = z.object({
    apiKey: z.string().optional(),
    model: z.string().default('claude-sonnet-4-5-20250929'),
    workspaceRoot: z.string().default(process.cwd()),
    maxTokens: z.number().default(8192),
    language: z.string().default('en'),
});

export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_CONFIG: Config = {
    model: 'claude-3-5-sonnet',
    maxTokens: 4096,
    language: 'en',
    workspaceRoot: process.cwd(),
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

        return this.reload();
    }

    async reload(): Promise<Config> {
        let loadedConfig = DEFAULT_CONFIG;

        try {
            const data = await fs.readFile(this.configPath, 'utf-8');
            const parsed = JSON.parse(data);
            loadedConfig = { ...DEFAULT_CONFIG, ...parsed };
        } catch {
            // File missing or invalid, use defaults
        }

        const envKey = process.env.ANTHROPIC_API_KEY;

        const finalConfig = ConfigSchema.parse({
            ...loadedConfig,
            apiKey: envKey || loadedConfig.apiKey
        });

        this.cachedConfig = finalConfig;
        return finalConfig;
    }

    clearCache(): void {
        this.cachedConfig = null;
    }

    async save(config: Config): Promise<void> {
        const dir = path.dirname(this.configPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
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
