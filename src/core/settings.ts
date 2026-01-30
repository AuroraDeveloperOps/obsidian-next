/**
 * Settings Manager - User preferences and permissions
 *
 * Stored in: .obsidian/settings.json
 */

import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

const SETTINGS_DIR = '.obsidian';
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
        // Patterns always blocked
        deny: z.array(z.string()).default([]),
    }).default({}),

    // UI preferences
    ui: z.object({
        syntaxHighlight: z.boolean().default(true),
        diffColors: z.boolean().default(true),
        showLineNumbers: z.boolean().default(true),
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
        deny: [],
    },
    ui: {
        syntaxHighlight: true,
        diffColors: true,
        showLineNumbers: true,
    },
};

class SettingsManager {
    private settingsPath: string;
    private cached: Settings | null = null;

    constructor() {
        this.settingsPath = path.join(process.cwd(), SETTINGS_DIR, SETTINGS_FILE);
    }

    async load(): Promise<Settings> {
        if (this.cached) return this.cached;
        return this.reload();
    }

    async reload(): Promise<Settings> {
        try {
            const data = await fs.readFile(this.settingsPath, 'utf-8');
            const parsed = JSON.parse(data);
            this.cached = SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...parsed });
        } catch {
            // File doesn't exist - create it with defaults
            this.cached = DEFAULT_SETTINGS;
            await this.save(DEFAULT_SETTINGS);
        }
        return this.cached;
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
        if (newSettings.ui) {
            merged.ui = { ...current.ui, ...newSettings.ui };
        }

        const validated = SettingsSchema.parse(merged);

        const dir = path.dirname(this.settingsPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(this.settingsPath, JSON.stringify(validated, null, 2));

        this.cached = validated;
    }

    async get<K extends keyof Settings>(key: K): Promise<Settings[K]> {
        const s = await this.load();
        return s[key];
    }

    async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
        await this.save({ [key]: value } as Partial<Settings>);
    }

    /**
     * Check if a tool:command pattern is allowed
     */
    async isAllowed(tool: string, command: string): Promise<boolean> {
        const s = await this.load();
        const pattern = `${tool}:${command}`;

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
     * Check if a tool:command pattern is explicitly denied
     */
    async isDenied(tool: string, command: string): Promise<boolean> {
        const s = await this.load();
        const pattern = `${tool}:${command}`;

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
        this.cached = null;
    }

    getPath(): string {
        return this.settingsPath;
    }
}

export const settings = new SettingsManager();
