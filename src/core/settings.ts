/**
 * Settings Manager - User preferences and permissions
 *
 * Stored in: .obsidian/settings.json
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { z } from 'zod';

const SETTINGS_DIR = '.obsidian-next';
const SETTINGS_FILE = 'settings.json';

// Schema
export const SettingsSchema = z.object({
    // Execution mode
    mode: z.enum(['auto', 'plan', 'safe']).default('safe'),

    // Auto-accept settings
    autoAccept: z.object({
        enabled: z.boolean().default(false),
        readOperations: z.boolean().default(true),
        safeCommands: z.boolean().default(true),
    }).default({}),

    // Tool permissions
    permissions: z.object({
        // Patterns always allowed without prompt: "tool:pattern"
        allow: z.array(z.string()).default([]),
        // Patterns allowed without prompt AND without sandbox
        allowUnsandboxed: z.array(z.string()).default([]),
        // Patterns always blocked
        deny: z.array(z.string()).default([]),
    }).default({}),

    // Security settings
    security: z.object({
        // PII redaction before sending to LLM
        piiRedaction: z.boolean().default(true),
        // Audit logging of all commands
        auditLogging: z.boolean().default(true),
        // Key storage backend preference
        keyBackend: z.enum(['auto', 'keychain', 'secret-tool', 'encrypted-file', 'env']).default('auto'),
        // Restrict filesystem access to sandbox directories
        sandbox: z.boolean().default(false),
    }).default({}),

    // UI preferences
    ui: z.object({
        syntaxHighlight: z.boolean().default(true),
        diffColors: z.boolean().default(true),
        showLineNumbers: z.boolean().default(true),
        // Owl animation settings
        owlAnimation: z.object({
            enabled: z.boolean().default(true),
            flyWhenIdle: z.boolean().default(true),
            idleTimeout: z.number().default(60000),      // 60s before idle animation
            sleepTimeout: z.number().default(300000),    // 5m before sleep animation
        }).default({}),
    }).default({}),
});

export type Settings = z.infer<typeof SettingsSchema>;

// Default settings - safe mode approves NOTHING by default
const DEFAULT_SETTINGS: Settings = {
    mode: 'safe',
    autoAccept: {
        enabled: false,
        readOperations: false,
        safeCommands: false,
    },
    permissions: {
        allow: [],  // Empty - user builds their own allow list
        allowUnsandboxed: [],
        deny: [],
    },
    security: {
        piiRedaction: true,      // Enabled by default - protects user privacy
        auditLogging: true,      // Enabled by default - for accountability
        keyBackend: 'auto',      // Auto-detect best available backend
        sandbox: false,           // Disabled by default
    },
    ui: {
        syntaxHighlight: true,
        diffColors: true,
        showLineNumbers: true,
        owlAnimation: {
            enabled: true,
            flyWhenIdle: true,
            idleTimeout: 60000,      // 60s before idle animation
            sleepTimeout: 300000,    // 5m before sleep animation
        },
    },
};

class SettingsManager {
    private settingsPath: string;
    private cache: Settings | null = null;
    private sessionAllow = new Set<string>();
    private sessionUnsandboxed = new Set<string>();
    private sessionDeny = new Set<string>();

    constructor() {
        this.settingsPath = path.join(os.homedir(), SETTINGS_DIR, SETTINGS_FILE);
    }

    async load(): Promise<Settings> {
        if (this.cache) return this.cache;
        return this.reload();
    }

    async reload(): Promise<Settings> {
        try {
            const data = await fs.readFile(this.settingsPath, 'utf-8');
            const parsed = JSON.parse(data);
            this.cache = SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...parsed });
        } catch {
            // File doesn't exist - create it with defaults
            this.cache = DEFAULT_SETTINGS;
            await this.save(DEFAULT_SETTINGS);
        }
        return this.cache;
    }

    /**
     * Add a permission to the allow list (called when user approves a command)
     */
    async addAllowedPermission(tool: string, command: string): Promise<void> {
        const s = await this.load();
        const pattern = `${tool}:${command}`;

        // Don't add duplicates
        if (!s.permissions.allow.includes(pattern)) {
            s.permissions.allow.push(pattern);
            await this.save({ permissions: s.permissions });
        }
    }

    /**
     * Add a permission to the unsandboxed allow list
     */
    async addUnsandboxedPermission(tool: string, command: string): Promise<void> {
        const s = await this.load();
        const pattern = `${tool}:${command}`;

        if (!s.permissions.allowUnsandboxed.includes(pattern)) {
            s.permissions.allowUnsandboxed.push(pattern);
            // Also ensure it's in the regular allow list for consistency
            if (!s.permissions.allow.includes(pattern)) {
                s.permissions.allow.push(pattern);
            }
            await this.save({ permissions: s.permissions });
        }
    }

    /**
     * Add a permission to the session-only allow/deny list
     */
    async addSessionPermission(tool: string, command: string, approved: boolean, bypass: boolean = false): Promise<void> {
        const pattern = `${tool}:${command}`;
        if (approved) {
            this.sessionAllow.add(pattern);
            this.sessionDeny.delete(pattern);
            if (bypass) {
                this.sessionUnsandboxed.add(pattern);
            }
        } else {
            this.sessionDeny.add(pattern);
            this.sessionAllow.delete(pattern);
            this.sessionUnsandboxed.delete(pattern);
        }
    }

    /**
     * Add a permission to the deny list
     */
    async addDeniedPermission(tool: string, command: string): Promise<void> {
        const s = await this.load();
        const pattern = `${tool}:${command}`;

        if (!s.permissions.deny.includes(pattern)) {
            s.permissions.deny.push(pattern);
            await this.save({ permissions: s.permissions });
        }
    }

    async save(newSettings: Partial<Settings>): Promise<void> {
        const current = await this.load();
        const merged = { ...current, ...newSettings };

        // Deep merge for nested objects
        if (newSettings.autoAccept) {
            merged.autoAccept = { ...current.autoAccept, ...newSettings.autoAccept };
        }
        if (newSettings.permissions) {
            merged.permissions = { ...current.permissions, ...newSettings.permissions };
        }
        if (newSettings.security) {
            merged.security = { ...current.security, ...newSettings.security };
        }
        if (newSettings.ui) {
            merged.ui = { ...current.ui, ...newSettings.ui };
        }

        const validated = SettingsSchema.parse(merged);

        const dir = path.dirname(this.settingsPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(this.settingsPath, JSON.stringify(validated, null, 2));

        this.cache = validated;
    }

    async get<K extends keyof Settings>(key: K): Promise<Settings[K]> {
        const s = await this.load();
        return s[key];
    }

    async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
        await this.save({ [key]: value } as Partial<Settings>);
    }

    /**
     * Check if a tool:command pattern is authorized for THIS SESSION only
     */
    async isSessionAuthorized(tool: string, command: string): Promise<boolean> {
        const pattern = `${tool}:${command}`;
        return this.sessionAllow.has(pattern);
    }

    /**
     * Check if a tool:command pattern is allowed (session or persistent)
     */
    async isAllowed(tool: string, command: string): Promise<boolean> {
        const pattern = `${tool}:${command}`;

        // Check session allow first
        if (this.sessionAllow.has(pattern)) {
            return true;
        }

        const s = await this.load();

        // Check deny list first (deny takes precedence)
        for (const deny of s.permissions.deny) {
            if (this.matchPattern(pattern, deny)) {
                return false;
            }
        }

        // Check allow list
        for (const allow of s.permissions.allow) {
            if (this.matchPattern(pattern, allow)) {
                return true;
            }
        }

        // Not in any list - follow mode rules
        return false;
    }

    /**
     * Check if a tool:command pattern is allowed to bypass sandbox
     */
    async isUnsandboxed(tool: string, command: string): Promise<boolean> {
        const pattern = `${tool}:${command}`;

        if (this.sessionUnsandboxed.has(pattern)) {
            return true;
        }

        const s = await this.load();

        for (const allow of s.permissions.allowUnsandboxed) {
            if (this.matchPattern(pattern, allow)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if a tool:command pattern is explicitly denied
     */
    async isDenied(tool: string, command: string): Promise<boolean> {
        const pattern = `${tool}:${command}`;

        // Check session deny first
        if (this.sessionDeny.has(pattern)) {
            return true;
        }

        const s = await this.load();

        for (const deny of s.permissions.deny) {
            if (this.matchPattern(pattern, deny)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Simple glob-like pattern matching
     * Supports * as wildcard
     */
    private matchPattern(value: string, pattern: string): boolean {
        const regex = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex chars
            .replace(/\*/g, '.*');  // * becomes .*
        return new RegExp(`^${regex}$`).test(value);
    }

    clearCache(): void {
        this.cache = null;
    }

    getPath(): string {
        return this.settingsPath;
    }
}

export const settings = new SettingsManager();
