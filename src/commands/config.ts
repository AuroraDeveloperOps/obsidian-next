/**
 * /config - Interactive configuration editor
 *
 * Usage:
 *   /config               - Interactive menu
 *   /config show          - Show current configuration
 *   /config set <k> <v>   - Set a configuration value
 *   /config reset         - Reset to defaults
 *   /config export        - Export settings to JSON
 *   /config import <file> - Import settings from JSON
 *   /config rotate-key    - Rotate API key
 */

import { bus } from '../core/bus.js';
import { config, Config } from '../core/config.js';
import { settings, Settings } from '../core/settings.js';
import { keyManager } from '../core/keyManager.js';
import { CommandHandler } from '../core/commands.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Helper to generate unique request IDs
function generateRequestId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Helper to wait for choice selection
function waitForChoice(question: string, options: Array<{ id: string; label: string }>): Promise<string> {
    return new Promise((resolve) => {
        const handler = (event: any) => {
            if (event.type === 'user_choice') {
                bus.off('user', handler);
                resolve(event.selectionId);
            }
        };
        bus.on('user', handler);

        bus.emitAgent({
            type: 'choice_request',
            question,
            options: options.map(o => ({ id: o.id, label: o.label })),
        });

        setTimeout(() => {
            bus.off('user', handler);
            resolve('cancel');
        }, 5 * 60 * 1000);
    });
}

// Helper to wait for text input
function waitForTextInput(prompt: string, masked = false): Promise<{ value: string; cancelled: boolean }> {
    return new Promise((resolve) => {
        const requestId = generateRequestId();
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

        bus.emitAgent({
            type: 'text_input_request',
            requestId,
            prompt,
            masked,
        });

        setTimeout(() => {
            bus.off('user', handler);
            resolve({ value: '', cancelled: true });
        }, 5 * 60 * 1000);
    });
}

export const configCommand: CommandHandler = async (args) => {
    const subcommand = args[0];

    // No args = interactive menu
    if (!subcommand) {
        await interactiveMenu();
        return;
    }

    switch (subcommand) {
        case 'show':
            await showConfig();
            break;
        case 'set':
            await setConfig(args.slice(1));
            break;
        case 'reset':
            await resetConfig();
            break;
        case 'export':
            await exportConfig(args[1]);
            break;
        case 'import':
            await importConfig(args[1]);
            break;
        case 'rotate-key':
            await rotateKey();
            break;
        default:
            bus.emitAgent({
                type: 'error',
                message: `Unknown subcommand: ${subcommand}. Use /config for interactive menu.`,
            });
    }
};

async function interactiveMenu(): Promise<void> {
    const mainOptions = [
        { id: 'model', label: 'Model - Change AI model' },
        { id: 'mode', label: 'Mode - Execution mode (auto/plan/safe)' },
        { id: 'security', label: 'Security - PII redaction, audit logging' },
        { id: 'permissions', label: 'Permissions - Allow/deny lists' },
        { id: 'show', label: 'Show - View all settings' },
        { id: 'export', label: 'Export - Save settings to file' },
    ];

    const selection = await waitForChoice('Configuration Menu', mainOptions);

    if (selection === 'cancel') {
        bus.emitAgent({ type: 'done', summary: 'Configuration cancelled.' });
        return;
    }

    switch (selection) {
        case 'model':
            await configureModel();
            break;
        case 'mode':
            await configureMode();
            break;
        case 'security':
            await configureSecurity();
            break;
        case 'permissions':
            await configurePermissions();
            break;
        case 'show':
            await showConfig();
            break;
        case 'export':
            await exportConfig();
            break;
    }
}

async function configureModel(): Promise<void> {
    const models = [
        { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (Recommended)' },
        { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Fast)' },
        { id: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5 (Most capable)' },
    ];

    const selection = await waitForChoice('Select AI Model', models);

    if (selection === 'cancel') {
        return;
    }

    const cfg = await config.load();
    await config.save({ ...cfg, model: selection });

    const selected = models.find(m => m.id === selection);
    bus.emitAgent({
        type: 'done',
        summary: `Model changed to ${selected?.label || selection}`,
    });
}

async function configureMode(): Promise<void> {
    const modes = [
        { id: 'safe', label: 'Safe (Default) - Approval required for writes' },
        { id: 'plan', label: 'Plan - Read-only until approved' },
        { id: 'auto', label: 'Auto - Execute without confirmation' },
    ];

    const selection = await waitForChoice('Select Execution Mode', modes);

    if (selection === 'cancel') {
        return;
    }

    await settings.set('mode', selection as Settings['mode']);

    // Show warning for auto mode
    if (selection === 'auto') {
        bus.emitAgent({
            type: 'thought',
            content: '[WARN] Auto mode will execute all commands without confirmation!',
        });
    }

    bus.emitAgent({
        type: 'done',
        summary: `Mode changed to ${selection}`,
    });
}

async function configureSecurity(): Promise<void> {
    const s = await settings.load();

    const options = [
        {
            id: 'pii',
            label: `PII Redaction: ${s.security.piiRedaction ? 'ON' : 'OFF'} (toggle)`,
        },
        {
            id: 'audit',
            label: `Audit Logging: ${s.security.auditLogging ? 'ON' : 'OFF'} (toggle)`,
        },
        { id: 'rotate', label: 'Rotate API Key' },
    ];

    const selection = await waitForChoice('Security Settings', options);

    if (selection === 'cancel') {
        return;
    }

    if (selection === 'pii') {
        const newValue = !s.security.piiRedaction;

        // Confirm disabling PII redaction
        if (!newValue) {
            const confirm = await waitForChoice(
                '[WARN] Disabling PII redaction will send sensitive data to the LLM. Continue?',
                [
                    { id: 'yes', label: 'Yes, disable PII redaction' },
                    { id: 'no', label: 'No, keep it enabled' },
                ]
            );
            if (confirm !== 'yes') {
                bus.emitAgent({ type: 'done', summary: 'PII redaction kept enabled.' });
                return;
            }
        }

        await settings.save({ security: { ...s.security, piiRedaction: newValue } });
        bus.emitAgent({
            type: 'done',
            summary: `PII Redaction ${newValue ? 'enabled' : 'disabled'}`,
        });
    }

    if (selection === 'audit') {
        const newValue = !s.security.auditLogging;
        await settings.save({ security: { ...s.security, auditLogging: newValue } });
        bus.emitAgent({
            type: 'done',
            summary: `Audit Logging ${newValue ? 'enabled' : 'disabled'}`,
        });
    }

    if (selection === 'rotate') {
        await rotateKey();
    }
}

async function configurePermissions(): Promise<void> {
    const s = await settings.load();

    const options = [
        { id: 'add-allow', label: 'Add to allow list' },
        { id: 'add-deny', label: 'Add to deny list' },
        { id: 'clear-allow', label: 'Clear allow list' },
        { id: 'clear-deny', label: 'Clear deny list' },
    ];

    const content = [
        'Current Permission Policy',
        '',
        '   [Allow List]',
        ...(s.permissions.allow.length > 0
            ? s.permissions.allow.map(p => `   ⎿  + ${p}`)
            : ['   ⎿  (empty)']),
        '',
        '   [Deny List]',
        ...(s.permissions.deny.length > 0
            ? s.permissions.deny.map(p => `   ⎿  - ${p}`)
            : ['   ⎿  (empty)']),
        '',
    ].join('\n');

    const question = [
        content,
        'Permission Actions'
    ].join('\n');

    const selection = await waitForChoice(question, options);

    if (selection === 'cancel') {
        return;
    }

    if (selection === 'add-allow') {
        const { value, cancelled } = await waitForTextInput('Enter pattern (tool:command, e.g., bash:git*):');
        if (!cancelled && value) {
            s.permissions.allow.push(value);
            await settings.save({ permissions: s.permissions });
            bus.emitAgent({ type: 'done', summary: `Added "${value}" to allow list` });
        }
    }

    if (selection === 'add-deny') {
        const { value, cancelled } = await waitForTextInput('Enter pattern (tool:command):');
        if (!cancelled && value) {
            s.permissions.deny.push(value);
            await settings.save({ permissions: s.permissions });
            bus.emitAgent({ type: 'done', summary: `Added "${value}" to deny list` });
        }
    }

    if (selection === 'clear-allow') {
        await settings.save({ permissions: { ...s.permissions, allow: [] } });
        bus.emitAgent({ type: 'done', summary: 'Allow list cleared' });
    }

    if (selection === 'clear-deny') {
        await settings.save({ permissions: { ...s.permissions, deny: [] } });
        bus.emitAgent({ type: 'done', summary: 'Deny list cleared' });
    }
}

async function showConfig(): Promise<void> {
    const cfg = await config.load();
    const s = await settings.load();
    const backend = keyManager.getBackend();

    const content = [
        'Configuration Overview',
        '',
        '   [Core System]',
        `   ⎿  Model       ${cfg.model}`,
        `   ⎿  Tokens      Max ${cfg.maxTokens}`,
        `   ⎿  Language    ${cfg.language}`,
        '',
        '   [Execution]',
        `   ⎿  Mode        ${s.mode}`,
        `   ⎿  Sandbox     ${s.mode === 'safe' ? 'ON' : 'OFF'}`,
        '',
        '   [Security]',
        `   ⎿  API Key     ${backend ? `Stored in ${backend}` : 'Not configured'}`,
        `   ⎿  PII Redact  ${s.security.piiRedaction ? 'ON' : 'OFF'}`,
        `   ⎿  Audit Log   ${s.security.auditLogging ? 'ON' : 'OFF'}`,
        '',
        '   [Permissions]',
        `   ⎿  Allow       ${s.permissions.allow.length} patterns`,
        `   ⎿  Deny        ${s.permissions.deny.length} patterns`,
        '',
        '   [System Paths]',
        `   ⎿  Config      ${path.basename(config.getPath())}`,
        `   ⎿  Settings    ${path.basename(settings.getPath())}`,
        '',
    ].join('\n');

    bus.emitAgent({
        type: 'thought',
        content,
    });

    bus.emitAgent({
        type: 'done',
        summary: 'Configuration displayed',
    });
}

async function setConfig(args: string[]): Promise<void> {
    const key = args[0];
    const value = args.slice(1).join(' ');

    if (!key || !value) {
        bus.emitAgent({
            type: 'error',
            message: 'Usage: /config set <key> <value>\nKeys: model, maxTokens, mode, piiRedaction, auditLogging',
        });
        return;
    }

    // Handle different keys
    switch (key) {
        case 'model':
            const cfg = await config.load();
            await config.save({ ...cfg, model: value });
            break;

        case 'maxTokens':
            const num = parseInt(value);
            if (isNaN(num) || num < 100 || num > 200000) {
                bus.emitAgent({ type: 'error', message: 'maxTokens must be between 100 and 200000' });
                return;
            }
            const cfg2 = await config.load();
            await config.save({ ...cfg2, maxTokens: num });
            break;

        case 'mode':
            if (!['auto', 'plan', 'safe'].includes(value)) {
                bus.emitAgent({ type: 'error', message: 'mode must be: auto, plan, or safe' });
                return;
            }
            await settings.set('mode', value as Settings['mode']);
            break;

        case 'piiRedaction':
            const pii = value === 'true' || value === 'on' || value === '1';
            const s = await settings.load();
            await settings.save({ security: { ...s.security, piiRedaction: pii } });
            break;

        case 'auditLogging':
            const audit = value === 'true' || value === 'on' || value === '1';
            const s2 = await settings.load();
            await settings.save({ security: { ...s2.security, auditLogging: audit } });
            break;

        default:
            bus.emitAgent({ type: 'error', message: `Unknown key: ${key}` });
            return;
    }

    bus.emitAgent({
        type: 'done',
        summary: `Set ${key} = ${value}`,
    });
}

async function resetConfig(): Promise<void> {
    const confirm = await waitForChoice(
        'Reset all configuration to defaults?',
        [
            { id: 'yes', label: 'Yes, reset everything' },
            { id: 'no', label: 'No, cancel' },
        ]
    );

    if (confirm !== 'yes') {
        bus.emitAgent({ type: 'done', summary: 'Reset cancelled.' });
        return;
    }

    await config.save({
        model: 'claude-opus-4-6-20260207',
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
        thinkingEffort: 'high',
        preCountTokens: true,
    });

    await settings.save({
        mode: 'safe',
        autoAccept: { enabled: false, readOperations: false, safeCommands: false },
        permissions: { allow: [], allowUnsandboxed: [], deny: [] },
        security: { piiRedaction: true, auditLogging: true, keyBackend: 'auto', sandbox: false },
        ui: { syntaxHighlight: true, diffColors: true, showLineNumbers: true, owlAnimation: { enabled: true, flyWhenIdle: true, idleTimeout: 60000, sleepTimeout: 300000 } },
    });

    bus.emitAgent({
        type: 'done',
        summary: 'Configuration reset to defaults.',
    });
}

async function exportConfig(filepath?: string): Promise<void> {
    const cfg = await config.load();
    const s = await settings.load();

    const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        config: {
            model: cfg.model,
            maxTokens: cfg.maxTokens,
            language: cfg.language,
        },
        settings: s,
    };

    const outputPath = filepath || path.join(os.homedir(), 'obsidian-config-export.json');

    await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));

    bus.emitAgent({
        type: 'done',
        summary: `Configuration exported to ${outputPath}`,
    });
}

async function importConfig(filepath?: string): Promise<void> {
    if (!filepath) {
        bus.emitAgent({
            type: 'error',
            message: 'Usage: /config import <filepath>',
        });
        return;
    }

    try {
        const data = await fs.readFile(filepath, 'utf-8');
        const importData = JSON.parse(data);

        if (importData.version !== 1) {
            bus.emitAgent({
                type: 'error',
                message: 'Unsupported export version',
            });
            return;
        }

        const confirm = await waitForChoice(
            `Import configuration from ${filepath}?`,
            [
                { id: 'yes', label: 'Yes, import and overwrite current settings' },
                { id: 'no', label: 'No, cancel' },
            ]
        );

        if (confirm !== 'yes') {
            bus.emitAgent({ type: 'done', summary: 'Import cancelled.' });
            return;
        }

        if (importData.config) {
            await config.save(importData.config);
        }

        if (importData.settings) {
            await settings.save(importData.settings);
        }

        bus.emitAgent({
            type: 'done',
            summary: 'Configuration imported successfully.',
        });
    } catch (error) {
        bus.emitAgent({
            type: 'error',
            message: `Failed to import: ${error instanceof Error ? error.message : String(error)}`,
        });
    }
}

async function rotateKey(): Promise<void> {
    const prompt = 'API Key Rotation\n\nThis will replace your current API key with a new one.\n\nEnter new API key:';
    const { value: newKey, cancelled } = await waitForTextInput(prompt, true);

    if (cancelled || !newKey) {
        bus.emitAgent({ type: 'done', summary: 'Key rotation cancelled.' });
        return;
    }

    const isValid = await keyManager.validateKey(newKey);
    if (!isValid) {
        bus.emitAgent({
            type: 'error',
            message: 'Invalid API key format.',
        });
        return;
    }

    // Delete old key and store new one
    await keyManager.deleteKey();
    const result = await keyManager.storeKey(newKey);

    if (result.success) {
        bus.emitAgent({
            type: 'done',
            summary: `API key rotated. New key stored in ${result.backend}.`,
        });
    } else {
        bus.emitAgent({
            type: 'error',
            message: `Failed to store new key: ${result.error}`,
        });
    }
}
