import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../src/core/config.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'obsidian-next-test');
const TEST_CONFIG_PATH = path.join(TEST_DIR, 'config.json');

describe('ConfigManager', () => {
    let configManager: ConfigManager;

    beforeEach(async () => {
        await fs.mkdir(TEST_DIR, { recursive: true });
        configManager = new ConfigManager(TEST_CONFIG_PATH);
    });

    afterEach(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    it('should return default config if file does not exist', async () => {
        const config = await configManager.load();
        expect(config.model).toBe('claude-3-5-sonnet');
    });

    it('should save and load config', async () => {
        const newConfig = {
            model: 'ollama' as const,
            maxTokens: 100,
            language: 'fr'
        };
        await configManager.save(newConfig);

        const loaded = await configManager.load();
        expect(loaded).toMatchObject(newConfig);
    });
});
