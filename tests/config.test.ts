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
<<<<<<< HEAD
        expect(config.model).toBe('claude-3-5-sonnet');
=======
        expect(config.model).toBe('claude-sonnet-4-5-20250929');
>>>>>>> polyoxy-dev/v0.4.0-mcp
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
<<<<<<< HEAD
=======

    it('should detect deprecated apiKey in config', async () => {
        // Write config with deprecated apiKey
        const configWithKey = {
            model: 'claude-sonnet-4-5-20250929',
            apiKey: 'sk-ant-test-key'
        };
        await fs.writeFile(TEST_CONFIG_PATH, JSON.stringify(configWithKey));

        const config = await configManager.load();
        expect(configManager.hasDeprecatedKey()).toBe(true);
        expect(configManager.getDeprecatedApiKey()).toBe('sk-ant-test-key');
    });

    it('should remove apiKey from config when removeApiKeyFromConfig is called', async () => {
        // Write config with apiKey
        const configWithKey = {
            model: 'claude-sonnet-4-5-20250929',
            apiKey: 'sk-ant-test-key',
            maxTokens: 4096
        };
        await fs.writeFile(TEST_CONFIG_PATH, JSON.stringify(configWithKey));

        // Load to detect deprecated key
        await configManager.load();
        expect(configManager.hasDeprecatedKey()).toBe(true);

        // Remove apiKey
        await configManager.removeApiKeyFromConfig();

        // Verify apiKey is removed
        const rawConfig = JSON.parse(await fs.readFile(TEST_CONFIG_PATH, 'utf-8'));
        expect(rawConfig.apiKey).toBeUndefined();
        expect(rawConfig.model).toBe('claude-sonnet-4-5-20250929');
        expect(rawConfig.maxTokens).toBe(4096);
    });

    it('should not save apiKey to config file', async () => {
        const configWithKey = {
            model: 'claude-sonnet-4-5-20250929',
            maxTokens: 100,
            apiKey: 'should-not-be-saved'
        };
        await configManager.save(configWithKey);

        // Read raw file to verify apiKey was not saved
        const rawConfig = JSON.parse(await fs.readFile(TEST_CONFIG_PATH, 'utf-8'));
        expect(rawConfig.apiKey).toBeUndefined();
        expect(rawConfig.model).toBe('claude-sonnet-4-5-20250929');
    });
>>>>>>> polyoxy-dev/v0.4.0-mcp
});
