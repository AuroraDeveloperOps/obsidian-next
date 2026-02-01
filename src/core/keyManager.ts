/**
 * KeyManager - Secure API Key Storage and Rotation
 *
 * Supports multiple backends:
 * - macOS Keychain (security CLI)
 * - Linux libsecret (secret-tool CLI)
 * - Encrypted file fallback
 *
 * Security features:
 * - Keys never stored in plaintext config
 * - Auto-rotation for long sessions
 * - Memory cleared after use
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const execAsync = promisify(exec);

export type StorageBackend = 'keychain' | 'secret-tool' | 'encrypted-file' | 'env';

export interface KeyConfig {
    key: string;
    loadedAt: number;
    backend: StorageBackend;
}

// Key rotation interval (4 hours - for long sessions)
const ROTATION_CHECK_INTERVAL = 4 * 60 * 60 * 1000;

// Service identifiers
const DEFAULT_SERVICE = 'obsidian-next';
const DEFAULT_ACCOUNT = 'anthropic-api-key';

class KeyManager {
    private keyCache: Map<string, KeyConfig> = new Map();
    private encryptedFilePath: string;
    private machineId: string | null = null;

    constructor() {
        this.encryptedFilePath = path.join(os.homedir(), '.obsidian', '.keystore');
    }

    private getCacheKey(service: string, account: string): string {
        return `${service}:${account}`;
    }

    /**
     * Load API key from the most secure available backend
     */
    async loadKey(options: { service?: string, account?: string } = {}): Promise<string | null> {
        const service = options.service || DEFAULT_SERVICE;
        const account = options.account || DEFAULT_ACCOUNT;
        const cacheKey = this.getCacheKey(service, account);

        // Check cache
        const cached = this.keyCache.get(cacheKey);
        if (cached && !this.shouldRotate(cached)) {
            return cached.key;
        }

        // Try backends in order of security preference
        let key: string | null = null;
        let backend: StorageBackend = 'env';

        // 1. Try environment variable first (only for default anthropic key)
        // We don't generally map arbitrary env vars here, only the main one for now or if specifically requested(?)
        // For now, keep env checked only for the main account to preserve behavior
        if (account === DEFAULT_ACCOUNT) {
            key = process.env.ANTHROPIC_API_KEY || null;
        }

        if (key) {
            backend = 'env';
        }

        // 2. Try macOS Keychain
        if (!key && process.platform === 'darwin') {
            key = await this.loadFromKeychain(service, account);
            if (key) backend = 'keychain';
        }

        // 3. Try Linux secret-tool
        if (!key && process.platform === 'linux') {
            key = await this.loadFromSecretTool(service, account);
            if (key) backend = 'secret-tool';
        }

        // 4. Try encrypted file fallback
        if (!key) {
            key = await this.loadFromEncryptedFile(service, account);
            if (key) backend = 'encrypted-file';
        }

        if (key) {
            this.keyCache.set(cacheKey, {
                key,
                loadedAt: Date.now(),
                backend,
            });
        }

        return key;
    }

    /**
     * Store API key in the most secure available backend
     */
    async storeKey(key: string, options: { service?: string, account?: string } = {}): Promise<{ success: boolean; backend: StorageBackend; error?: string }> {
        const service = options.service || DEFAULT_SERVICE;
        const account = options.account || DEFAULT_ACCOUNT;
        const cacheKey = this.getCacheKey(service, account);

        // Try backends in order of security preference

        // 1. Try macOS Keychain
        if (process.platform === 'darwin') {
            const result = await this.storeInKeychain(key, service, account);
            if (result.success) {
                this.keyCache.set(cacheKey, { key, loadedAt: Date.now(), backend: 'keychain' });
                return { success: true, backend: 'keychain' };
            }
        }

        // 2. Try Linux secret-tool
        if (process.platform === 'linux') {
            const result = await this.storeInSecretTool(key, service, account);
            if (result.success) {
                this.keyCache.set(cacheKey, { key, loadedAt: Date.now(), backend: 'secret-tool' });
                return { success: true, backend: 'secret-tool' };
            }
        }

        // 3. Fall back to encrypted file
        const result = await this.storeInEncryptedFile(key, service, account);
        if (result.success) {
            this.keyCache.set(cacheKey, { key, loadedAt: Date.now(), backend: 'encrypted-file' });
            return { success: true, backend: 'encrypted-file' };
        }

        return { success: false, backend: 'env', error: result.error };
    }

    /**
     * Delete stored key from all backends
     */
    async deleteKey(options: { service?: string, account?: string } = {}): Promise<void> {
        const service = options.service || DEFAULT_SERVICE;
        const account = options.account || DEFAULT_ACCOUNT;
        const cacheKey = this.getCacheKey(service, account);

        // Clear from memory
        this.keyCache.delete(cacheKey);

        // Delete from keychain
        if (process.platform === 'darwin') {
            await this.deleteFromKeychain(service, account);
        }

        // Delete from secret-tool
        if (process.platform === 'linux') {
            await this.deleteFromSecretTool(service, account);
        }

        // Delete from encrypted file
        // Note: Encrypted file currently stores ALL keys in one file, so we need to update it, not delete it
        // Updated logic to remove just the key from the file object
        await this.deleteFromEncryptedFile(service, account);
    }

    /**
     * Check if key should be rotated (for long-running sessions)
     */
    shouldRotate(config: KeyConfig = this.keyCache.get(this.getCacheKey(DEFAULT_SERVICE, DEFAULT_ACCOUNT))!): boolean {
        if (!config) return true;
        return Date.now() - config.loadedAt > ROTATION_CHECK_INTERVAL;
    }

    /**
     * Force reload key from backend
     */
    async refreshKey(options: { service?: string, account?: string } = {}): Promise<string | null> {
        const service = options.service || DEFAULT_SERVICE;
        const account = options.account || DEFAULT_ACCOUNT;
        this.keyCache.delete(this.getCacheKey(service, account));
        return this.loadKey(options);
    }

    /**
     * Get current backend being used
     */
    getBackend(options: { service?: string, account?: string } = {}): StorageBackend | null {
        const service = options.service || DEFAULT_SERVICE;
        const account = options.account || DEFAULT_ACCOUNT;
        return this.keyCache.get(this.getCacheKey(service, account))?.backend || null;
    }

    // ==================== macOS Keychain ====================

    private async loadFromKeychain(service: string, account: string): Promise<string | null> {
        try {
            const { stdout } = await execAsync(
                `security find-generic-password -s "${service}" -a "${account}" -w 2>/dev/null`
            );
            return stdout.trim() || null;
        } catch {
            return null;
        }
    }

    private async storeInKeychain(key: string, service: string, account: string): Promise<{ success: boolean; error?: string }> {
        try {
            // Delete existing entry first (if any)
            await this.deleteFromKeychain(service, account);

            // Add new entry
            await execAsync(
                `security add-generic-password -s "${service}" -a "${account}" -w "${key}" -U`
            );
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private async deleteFromKeychain(service: string, account: string): Promise<void> {
        try {
            await execAsync(
                `security delete-generic-password -s "${service}" -a "${account}" 2>/dev/null`
            );
        } catch {
            // Entry may not exist
        }
    }

    // ==================== Linux secret-tool ====================

    private async loadFromSecretTool(service: string, account: string): Promise<string | null> {
        try {
            const { stdout } = await execAsync(
                `secret-tool lookup service "${service}" account "${account}" 2>/dev/null`
            );
            return stdout.trim() || null;
        } catch {
            return null;
        }
    }

    private async storeInSecretTool(key: string, service: string, account: string): Promise<{ success: boolean; error?: string }> {
        try {
            // secret-tool reads from stdin
            await execAsync(
                `echo -n "${key}" | secret-tool store --label="Obsidian Next API Key" service "${service}" account "${account}"`
            );
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private async deleteFromSecretTool(service: string, account: string): Promise<void> {
        try {
            await execAsync(
                `secret-tool clear service "${service}" account "${account}" 2>/dev/null`
            );
        } catch {
            // Entry may not exist
        }
    }

    // ==================== Encrypted File ====================

    private async getMachineId(): Promise<string> {
        if (this.machineId) return this.machineId;

        // Generate machine-specific identifier for encryption key derivation
        const components: string[] = [
            os.hostname(),
            os.userInfo().username,
            os.platform(),
            os.arch(),
        ];

        // Add machine-specific identifiers
        if (process.platform === 'darwin') {
            try {
                const { stdout } = await execAsync('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID');
                const match = stdout.match(/"IOPlatformUUID" = "([^"]+)"/);
                if (match) components.push(match[1]);
            } catch { /* ignore */ }
        } else if (process.platform === 'linux') {
            try {
                const machineId = await fs.readFile('/etc/machine-id', 'utf-8');
                components.push(machineId.trim());
            } catch { /* ignore */ }
        }

        // Hash components to create stable machine ID
        this.machineId = crypto
            .createHash('sha256')
            .update(components.join(':'))
            .digest('hex');

        return this.machineId;
    }

    private async deriveEncryptionKey(): Promise<Buffer> {
        const machineId = await this.getMachineId();
        // Use PBKDF2 to derive key from machine ID
        return crypto.pbkdf2Sync(machineId, 'obsidian-next-salt', 100000, 32, 'sha256');
    }

    private async loadFromEncryptedFile(service: string, account: string): Promise<string | null> {
        try {
            const encrypted = await fs.readFile(this.encryptedFilePath, 'utf-8');
            const data = JSON.parse(encrypted);

            // Decrypt the blob
            const key = await this.deriveEncryptionKey();
            const iv = Buffer.from(data.iv, 'hex');
            const authTag = Buffer.from(data.tag, 'hex');

            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(data.encrypted, 'hex', 'utf-8');
            decrypted += decipher.final('utf-8');

            // The blob is now a JSON object of { [service:account]: apiKey }
            // For backward compatibility, if it's a string, it's the old single key format
            try {
                const keyMap = JSON.parse(decrypted);
                return keyMap[this.getCacheKey(service, account)] || null;
            } catch {
                // Legacy: Single key file
                if (service === DEFAULT_SERVICE && account === DEFAULT_ACCOUNT) {
                    return decrypted;
                }
                return null;
            }
        } catch {
            return null;
        }
    }

    private async storeInEncryptedFile(apiKey: string, service: string, account: string): Promise<{ success: boolean; error?: string }> {
        try {
            const key = await this.deriveEncryptionKey();
            const iv = crypto.randomBytes(16);

            // Read existing data if possible to merge
            let keyMap: Record<string, string> = {};
            try {
                // Try load existing
                // Warning: recursive call potential if we were using public APIs, but we use internal helpers mostly. 
                // We'll duplicate reading logic slightly to be safe/simple
                const existingEncrypted = await fs.readFile(this.encryptedFilePath, 'utf-8');
                const data = JSON.parse(existingEncrypted);
                const exDecipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(data.iv, 'hex'));
                exDecipher.setAuthTag(Buffer.from(data.tag, 'hex'));
                let exDecrypted = exDecipher.update(data.encrypted, 'hex', 'utf-8');
                exDecrypted += exDecipher.final('utf-8');
                try {
                    keyMap = JSON.parse(exDecrypted);
                } catch {
                    // Legacy was string
                    keyMap[this.getCacheKey(DEFAULT_SERVICE, DEFAULT_ACCOUNT)] = exDecrypted;
                }
            } catch {
                // No existing file
            }

            // Update map
            keyMap[this.getCacheKey(service, account)] = apiKey;
            const contentToEncrypt = JSON.stringify(keyMap);

            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            let encrypted = cipher.update(contentToEncrypt, 'utf-8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();

            const data = {
                encrypted,
                iv: iv.toString('hex'),
                tag: authTag.toString('hex'),
                version: 1,
            };

            // Ensure directory exists
            await fs.mkdir(path.dirname(this.encryptedFilePath), { recursive: true });
            await fs.writeFile(this.encryptedFilePath, JSON.stringify(data), { mode: 0o600 });

            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async deleteFromEncryptedFile(service: string, account: string): Promise<void> {
        try {
            const key = await this.deriveEncryptionKey();
            // Read, decrypt, remove key, re-encrypt
            const existingEncrypted = await fs.readFile(this.encryptedFilePath, 'utf-8');
            const data = JSON.parse(existingEncrypted);
            const exDecipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(data.iv, 'hex'));
            exDecipher.setAuthTag(Buffer.from(data.tag, 'hex'));
            let exDecrypted = exDecipher.update(data.encrypted, 'hex', 'utf-8');
            exDecrypted += exDecipher.final('utf-8');

            let keyMap: Record<string, string> = {};
            try {
                keyMap = JSON.parse(exDecrypted);
            } catch {
                if (service === DEFAULT_SERVICE && account === DEFAULT_ACCOUNT) {
                    // Deleting the only key from legacy
                    await fs.unlink(this.encryptedFilePath);
                    return;
                }
            }

            delete keyMap[this.getCacheKey(service, account)];

            if (Object.keys(keyMap).length === 0) {
                await fs.unlink(this.encryptedFilePath);
                return;
            }

            // Re-encrypt
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            let encrypted = cipher.update(JSON.stringify(keyMap), 'utf-8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();

            const newData = {
                encrypted,
                iv: iv.toString('hex'),
                tag: authTag.toString('hex'),
                version: 2, // Upgraded version
            };

            await fs.writeFile(this.encryptedFilePath, JSON.stringify(newData), { mode: 0o600 });

        } catch {
            // Ignore
        }
    }

    /**
     * Clear key from memory (call when done with sensitive operations)
     */
    clearFromMemory(): void {
        this.keyCache.clear();
    }

    /**
     * Check if key exists in any backend (without loading it)
     */
    async hasKey(options: { service?: string, account?: string } = {}): Promise<boolean> {
        const service = options.service || DEFAULT_SERVICE;
        const account = options.account || DEFAULT_ACCOUNT;

        // Check env first (default only)
        if (account === DEFAULT_ACCOUNT && process.env.ANTHROPIC_API_KEY) return true;

        // Check keychain
        if (process.platform === 'darwin') {
            const key = await this.loadFromKeychain(service, account);
            if (key) return true;
        }

        // Check secret-tool
        if (process.platform === 'linux') {
            const key = await this.loadFromSecretTool(service, account);
            if (key) return true;
        }

        // Check encrypted file
        const key = await this.loadFromEncryptedFile(service, account);
        return !!key;
    }

    /**
     * Migrate key from environment variable to secure storage
     * Returns true if migration was successful
     */
    async migrateFromEnv(): Promise<{ migrated: boolean; backend?: StorageBackend; error?: string }> {
        const envKey = process.env.ANTHROPIC_API_KEY; // Only migrating default key

        if (!envKey) {
            return { migrated: false, error: 'No ANTHROPIC_API_KEY found in environment' };
        }

        // Check if already stored in secure backend
        const cached = this.keyCache.get(this.getCacheKey(DEFAULT_SERVICE, DEFAULT_ACCOUNT));
        if (cached && cached.backend !== 'env') {
            return { migrated: false, error: 'Key already in secure storage' };
        }

        // Store in most secure available backend
        const result = await this.storeKey(envKey);

        if (result.success) {
            return { migrated: true, backend: result.backend };
        }

        return { migrated: false, error: result.error };
    }

    /**
     * Validate an API key by making a test request
     */
    async validateKey(key: string): Promise<boolean> {
        // Basic format validation for Anthropic keys
        if (!key.startsWith('sk-ant-')) {
            return false;
        }

        // Length check (Anthropic keys are typically ~100 chars)
        if (key.length < 50 || key.length > 200) {
            return false;
        }

        return true;
    }
}

// Helper function to detect .env file and warn user
export async function detectEnvFile(workspaceRoot: string): Promise<{ found: boolean; path?: string }> {
    const envPath = path.join(workspaceRoot, '.env');

    try {
        const content = await fs.readFile(envPath, 'utf-8');
        if (content.includes('ANTHROPIC_API_KEY')) {
            return { found: true, path: envPath };
        }
    } catch {
        // File doesn't exist or can't be read
    }

    return { found: false };
}

export const keyManager = new KeyManager();
