<<<<<<< HEAD
import { bus } from '../core/bus.js';
import { config } from '../core/config.js';
import { CommandHandler } from '../core/commands.js';

export const initCommand: CommandHandler = async (_args) => {
    bus.emitAgent({ type: 'thought', content: 'Checking configuration...' });

    if (await config.exists()) {
        bus.emitAgent({
            type: 'tool_result',
            tool: 'System',
            output: `Configuration already exists at ${config.getPath()}`
=======
/**
 * /init command - Initialize configuration with interactive setup
 *
 * Features:
 * - Interactive API key input (masked)
 * - Key validation before storage
 * - Model selection
 * - Shows storage backend being used
 * - --reset flag to reconfigure
 */

import { bus } from '../core/bus.js';
import { config } from '../core/config.js';
import { keyManager, detectEnvFile } from '../core/keyManager.js';
import { CommandHandler } from '../core/commands.js';

// Helper to generate unique request IDs
function generateRequestId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Helper to wait for text input response
function waitForTextInput(requestId: string): Promise<{ value: string; cancelled: boolean }> {
    return new Promise((resolve) => {
        const handler = (event: any) => {
            if (event.type === 'text_input_response' && event.requestId === requestId) {
                bus.off('user', handler);
                resolve({
                    value: event.value || '',
                    cancelled: event.cancelled || false,
                });
            }
        };
        bus.on('user', handler);

        // Timeout after 5 minutes
        setTimeout(() => {
            bus.off('user', handler);
            resolve({ value: '', cancelled: true });
        }, 5 * 60 * 1000);
    });
}

// Helper to wait for choice selection
function waitForChoice(options: Array<{ id: string; label: string }>): Promise<string> {
    return new Promise((resolve) => {
        const handler = (event: any) => {
            if (event.type === 'user_choice') {
                bus.off('user', handler);
                resolve(event.selectionId);
            }
        };
        bus.on('user', handler);

        // Emit choice request
        bus.emitAgent({
            type: 'choice_request',
            question: 'Select an option:',
            options: options.map(o => ({ id: o.id, label: o.label })),
        });

        // Timeout after 5 minutes
        setTimeout(() => {
            bus.off('user', handler);
            resolve('cancel');
        }, 5 * 60 * 1000);
    });
}

export const initCommand: CommandHandler = async (args) => {
    const isReset = args.includes('--reset') || args.includes('-r');
    const skipKey = args.includes('--skip-key');

    // Check for existing config
    const configExists = await config.exists();
    const hasKey = await keyManager.hasKey();

    if (configExists && hasKey && !isReset) {
        const backend = keyManager.getBackend();
        bus.emitAgent({
            type: 'thought',
            content: [
                '[INFO] Configuration already initialized.',
                '',
                `  Config:  ${config.getPath()}`,
                `  API Key: Stored in ${backend || 'unknown'}`,
                '',
                'Use /init --reset to reconfigure.',
            ].join('\n'),
        });
        bus.emitAgent({ type: 'done', summary: 'Already initialized.' });
        return;
    }

    bus.emitAgent({
        type: 'thought',
        content: [
            '='.repeat(50),
            'OBSIDIAN NEXT - Setup',
            '='.repeat(50),
            '',
        ].join('\n'),
    });

    // Step 1: API Key Setup
    if (!skipKey) {
        await setupApiKey(isReset);
    }

    // Step 2: Model Selection
    await setupModel();

    // Step 3: Show summary
    await showSetupSummary();

    bus.emitAgent({
        type: 'done',
        summary: 'Initialization complete.',
    });
};

async function setupApiKey(isReset: boolean): Promise<void> {
    const hasKey = await keyManager.hasKey();

    // Check for .env file
    const envFile = await detectEnvFile(process.cwd());
    if (envFile.found) {
        bus.emitAgent({
            type: 'thought',
            content: [
                '[WARN] Found .env file with API key.',
                'For security, consider migrating to secure storage.',
                '',
            ].join('\n'),
        });
    }

    if (hasKey && !isReset) {
        const backend = keyManager.getBackend();
        bus.emitAgent({
            type: 'thought',
            content: `[OK] API key already configured (${backend}).\n`,
>>>>>>> polyoxy-dev/v0.4.0-mcp
        });
        return;
    }

<<<<<<< HEAD
    bus.emitAgent({ type: 'thought', content: 'Creating default configuration...' });

    await config.save({
        model: 'claude-3-5-sonnet',
        maxTokens: 8192,
        language: 'en'
    });

    bus.emitAgent({
        type: 'tool_result',
        tool: 'System',
        output: `Initialized configuration at ${config.getPath()}`
    });
};
=======
    bus.emitAgent({
        type: 'thought',
        content: [
            '[Step 1/2] API Key Setup',
            '',
            'Your API key will be stored securely using:',
            '  - macOS: Keychain',
            '  - Linux: secret-tool (libsecret)',
            '  - Fallback: Encrypted file (~/.obsidian/.keystore)',
            '',
        ].join('\n'),
    });

    // Request API key input
    const requestId = generateRequestId();

    bus.emitAgent({
        type: 'text_input_request',
        requestId,
        prompt: 'Enter your Anthropic API key:',
        masked: true,
        placeholder: 'sk-ant-...',
    });

    const { value: apiKey, cancelled } = await waitForTextInput(requestId);

    if (cancelled || !apiKey) {
        bus.emitAgent({
            type: 'thought',
            content: '[SKIP] API key setup cancelled.\n',
        });
        return;
    }

    // Validate key format
    const isValid = await keyManager.validateKey(apiKey);
    if (!isValid) {
        bus.emitAgent({
            type: 'error',
            message: 'Invalid API key format. Anthropic keys start with "sk-ant-".',
        });
        return;
    }

    // Store the key
    bus.emitAgent({
        type: 'thought',
        content: 'Storing API key securely...',
    });

    const result = await keyManager.storeKey(apiKey);

    if (result.success) {
        bus.emitAgent({
            type: 'thought',
            content: `[OK] API key stored in ${result.backend}.\n`,
        });
    } else {
        bus.emitAgent({
            type: 'error',
            message: `Failed to store API key: ${result.error}`,
        });
    }
}

async function setupModel(): Promise<void> {
    bus.emitAgent({
        type: 'thought',
        content: '[Step 2/2] Model Selection\n',
    });

    const models = [
        { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (Recommended - balanced)' },
        { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Faster, cheaper)' },
        { id: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5 (Most capable)' },
    ];

    const selection = await waitForChoice(models);

    if (selection === 'cancel') {
        bus.emitAgent({
            type: 'thought',
            content: '[SKIP] Using default model (Sonnet 4.5).\n',
        });
        return;
    }

    // Save config with selected model
    const cfg = await config.load();
    await config.save({
        ...cfg,
        model: selection,
    });

    const selectedModel = models.find(m => m.id === selection);
    bus.emitAgent({
        type: 'thought',
        content: `[OK] Model set to: ${selectedModel?.label || selection}\n`,
    });
}

async function showSetupSummary(): Promise<void> {
    const cfg = await config.load();
    const backend = keyManager.getBackend();

    const lines = [
        '',
        '='.repeat(50),
        'SETUP COMPLETE',
        '='.repeat(50),
        '',
        '[Configuration]',
        `  Config file: ${config.getPath()}`,
        `  Model:       ${cfg.model}`,
        `  Max tokens:  ${cfg.maxTokens}`,
        '',
        '[Security]',
        `  API key storage: ${backend || 'Not configured'}`,
        '',
        'You can now start using Obsidian Next!',
        'Type a message or use /help for commands.',
        '='.repeat(50),
    ];

    bus.emitAgent({
        type: 'thought',
        content: lines.join('\n'),
    });
}
>>>>>>> polyoxy-dev/v0.4.0-mcp
