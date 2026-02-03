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
import { formatHeader } from '../utils/ui.js';

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
function waitForChoice(options: Array<{ id: string; label: string }>, title?: string): Promise<string> {
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
            question: title ? `${title}\nSelect an option:` : 'Select an option:',
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
    // Determine if we should show the menu loop or just run setup
    // For now, always prefer menu unless explicitly scripted (future)

    let running = true;

    while (running) {
        // Refresh config and key state before showing menu
        await config.reload();
        // Crucial: loadKey() ensures backend state is populated for getBackend()
        const apiKey = await keyManager.loadKey();
        const backend = keyManager.getBackend();
        const cfg = await config.load();

        // Menu Options
        const options = [
            { id: 'setup', label: 'Run Full Setup (Key + Model)' },
            { id: 'key', label: `Update API Key (Current: ${backend || 'Not set'})` },
            { id: 'model', label: `Change Model (Current: ${cfg.model})` },
            { id: 'status', label: 'Show Configuration Status' },
            { id: 'exit', label: 'Exit' }
        ];

        const choice = await waitForChoice(options, formatHeader('Configuration Menu'));

        switch (choice) {
            case 'setup':
                await setupApiKey(true); // Force reset
                await setupModel();
                await showSetupSummary();
                break;
            case 'key':
                await setupApiKey(true);
                break;
            case 'model':
                await setupModel();
                break;
            case 'status':
                // Navigate to /config view for detailed configuration
                running = false;
                bus.emitAgent({
                    type: 'view_request',
                    viewId: 'settings',
                    command: 'config',
                });
                bus.emitAgent({
                    type: 'done',
                    summary: 'Opening configuration...',
                });
                return; // Exit early to prevent double done message
            case 'exit':
            case 'cancel':
                running = false;
                break;
        }

        if (running) {
            bus.emitAgent({ type: 'thought', content: '\n' });
        }
    }

    bus.emitAgent({
        type: 'done',
        summary: 'Configuration closed.',
    });
};

async function setupApiKey(forceReset: boolean): Promise<void> {
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

    if (hasKey && !forceReset) {
        // Ensure backend info is available
        await keyManager.loadKey();
        const backend = keyManager.getBackend();
        bus.emitAgent({
            type: 'thought',
            content: `[OK] API key already configured (${backend}).\n`,
        });
        return;
    }

    bus.emitAgent({
        type: 'thought',
        content: [
            '[Setup] API Key',
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
            content: `\n[OK] API key stored in ${result.backend}.\n`,
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
        content: '[Setup] Model Selection\n',
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
    await keyManager.loadKey(); // Ensure backend state is populated
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
