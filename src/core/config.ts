import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { z } from 'zod';

export const ConfigSchema = z.object({
    model: z.enum(['claude-3-5-sonnet', 'claude-3-opus', 'ollama']),
    maxTokens: z.number().default(4096),
    language: z.string().default('en'),
    // Add more config options here
});

export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_CONFIG: Config = {
    model: 'claude-3-5-sonnet',
    maxTokens: 4096,
    language: 'en',
};

export class ConfigManager {
    private configPath: string;

    constructor(customPath?: string) {
        this.configPath = customPath || path.join(os.homedir(), '.obsidian', 'config.json');
    }

    async load(): Promise<Config> {
        try {
            const data = await fs.readFile(this.configPath, 'utf-8');
            return ConfigSchema.parse(JSON.parse(data));
        } catch (error) {
            // If file doesn't exist, return default
            return DEFAULT_CONFIG;
        }
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
