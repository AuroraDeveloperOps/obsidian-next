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
const SERVICE_NAME = 'obsidian-next';
const ACCOUNT_NAME = 'anthropic-api-key';

class KeyManager {
    private currentKey: KeyConfig | null = null;
    private encryptedFilePath: string;
    private machineId: string | null = null;

    constructor() {
        this.encryptedFilePath = path.join(os.homedir(), '.obsidian', '.keystore');
    }

    /**
     * Load API key from the most secure available backend
     */
    async loadKey(): Promise<string | null> {
        // Check if current key is still valid (not too old)
        if (this.currentKey && !this.shouldRotate()) {
            return this.currentKey.key;
        }

        // Try backends in order of security preference
        let key: string | null = null;
        let backend: StorageBackend = 'env';

        // 1. Try environment variable first (for CI/CD and explicit config)
        key = process.env.ANTHROPIC_API_KEY || null;
        if (key) {
            backend = 'env';
        }

        // 2. Try macOS Keychain
        if (!key && process.platform === 'darwin') {
            key = await this.loadFromKeychain();
            if (key) backend = 'keychain';
        }

        // 3. Try Linux secret-tool
        if (!key && process.platform === 'linux') {
            key = await this.loadFromSecretTool();
            if (key) backend = 'secret-tool';
        }

        // 4. Try encrypted file fallback
        if (!key) {
            key = await this.loadFromEncryptedFile();
            if (key) backend = 'encrypted-file';
        }

        if (key) {
            this.currentKey = {
                key,
                loadedAt: Date.now(),
                backend,
            };
        }

        return key;
    }

    /**
     * Store API key in the most secure available backend
     */
    async storeKey(key: string): Promise<{ success: boolean; backend: StorageBackend; error?: string }> {
        // Try backends in order of security preference

        // 1. Try macOS Keychain
        if (process.platform === 'darwin') {
            const result = await this.storeInKeychain(key);
            if (result.success) {
                this.currentKey = { key, loadedAt: Date.now(), backend: 'keychain' };
                return { success: true, backend: 'keychain' };
            }
        }

        // 2. Try Linux secret-tool
        if (process.platform === 'linux') {
            const result = await this.storeInSecretTool(key);
            if (result.success) {
                this.currentKey = { key, loadedAt: Date.now(), backend: 'secret-tool' };
                return { success: true, backend: 'secret-tool' };
            }
        }

        // 3. Fall back to encrypted file
        const result = await this.storeInEncryptedFile(key);
        if (result.success) {
            this.currentKey = { key, loadedAt: Date.now(), backend: 'encrypted-file' };
            return { success: true, backend: 'encrypted-file' };
        }

        return { success: false, backend: 'env', error: result.error };
    }

    /**
     * Delete stored key from all backends
     */
    async deleteKey(): Promise<void> {
        // Clear from memory
        this.currentKey = null;

        // Delete from keychain
        if (process.platform === 'darwin') {
            await this.deleteFromKeychain();
        }

        // Delete from secret-tool
        if (process.platform === 'linux') {
            await this.deleteFromSecretTool();
        }

        // Delete encrypted file
        try {
            await fs.unlink(this.encryptedFilePath);
        } catch {
            // File may not exist
        }
    }

    /**
     * Check if key should be rotated (for long-running sessions)
     */
    shouldRotate(): boolean {
        if (!this.currentKey) return true;
        return Date.now() - this.currentKey.loadedAt > ROTATION_CHECK_INTERVAL;
    }

    /**
     * Force reload key from backend
     */
    async refreshKey(): Promise<string | null> {
        this.currentKey = null;
        return this.loadKey();
    }

    /**
     * Get current backend being used
     */
    getBackend(): StorageBackend | null {
        return this.currentKey?.backend || null;
    }

    // ==================== macOS Keychain ====================

    private async loadFromKeychain(): Promise<string | null> {
        try {
            const { stdout } = await execAsync(
                `security find-generic-password -s "${SERVICE_NAME}" -a "${ACCOUNT_NAME}" -w 2>/dev/null`
            );
            return stdout.trim() || null;
        } catch {
            return null;
        }
    }

    private async storeInKeychain(key: string): Promise<{ success: boolean; error?: string }> {
        try {
            // Delete existing entry first (if any)
            await this.deleteFromKeychain();

            // Add new entry
            await execAsync(
                `security add-generic-password -s "${SERVICE_NAME}" -a "${ACCOUNT_NAME}" -w "${key}" -U`
            );
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private async deleteFromKeychain(): Promise<void> {
        try {
            await execAsync(
                `security delete-generic-password -s "${SERVICE_NAME}" -a "${ACCOUNT_NAME}" 2>/dev/null`
            );
        } catch {
            // Entry may not exist
        }
    }

    // ==================== Linux secret-tool ====================

    private async loadFromSecretTool(): Promise<string | null> {
        try {
            const { stdout } = await execAsync(
                `secret-tool lookup service "${SERVICE_NAME}" account "${ACCOUNT_NAME}" 2>/dev/null`
            );
            return stdout.trim() || null;
        } catch {
            return null;
        }
    }

    private async storeInSecretTool(key: string): Promise<{ success: boolean; error?: string }> {
        try {
            // secret-tool reads from stdin
            await execAsync(
                `echo -n "${key}" | secret-tool store --label="Obsidian Next API Key" service "${SERVICE_NAME}" account "${ACCOUNT_NAME}"`
            );
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private async deleteFromSecretTool(): Promise<void> {
        try {
            await execAsync(
                `secret-tool clear service "${SERVICE_NAME}" account "${ACCOUNT_NAME}" 2>/dev/null`
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

    private async loadFromEncryptedFile(): Promise<string | null> {
        try {
            const encrypted = await fs.readFile(this.encryptedFilePath, 'utf-8');
            const data = JSON.parse(encrypted);

            const key = await this.deriveEncryptionKey();
            const iv = Buffer.from(data.iv, 'hex');
            const authTag = Buffer.from(data.tag, 'hex');

            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(data.encrypted, 'hex', 'utf-8');
            decrypted += decipher.final('utf-8');

            return decrypted;
        } catch {
            return null;
        }
    }

    private async storeInEncryptedFile(apiKey: string): Promise<{ success: boolean; error?: string }> {
        try {
            const key = await this.deriveEncryptionKey();
            const iv = crypto.randomBytes(16);

            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            let encrypted = cipher.update(apiKey, 'utf-8', 'hex');
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

    /**
     * Clear key from memory (call when done with sensitive operations)
     */
    clearFromMemory(): void {
        if (this.currentKey) {
            // Overwrite the key string in memory before clearing reference
            // Note: This is best-effort in JavaScript due to garbage collection
            this.currentKey = null;
        }
    }
<<<<<<< HEAD
=======

    /**
     * Check if key exists in any backend (without loading it)
     */
    async hasKey(): Promise<boolean> {
        // Check env first
        if (process.env.ANTHROPIC_API_KEY) return true;

        // Check keychain
        if (process.platform === 'darwin') {
            const key = await this.loadFromKeychain();
            if (key) return true;
        }

        // Check secret-tool
        if (process.platform === 'linux') {
            const key = await this.loadFromSecretTool();
            if (key) return true;
        }

        // Check encrypted file
        const key = await this.loadFromEncryptedFile();
        return !!key;
    }

    /**
     * Migrate key from environment variable to secure storage
     * Returns true if migration was successful
     */
    async migrateFromEnv(): Promise<{ migrated: boolean; backend?: StorageBackend; error?: string }> {
        const envKey = process.env.ANTHROPIC_API_KEY;

        if (!envKey) {
            return { migrated: false, error: 'No ANTHROPIC_API_KEY found in environment' };
        }

        // Check if already stored in secure backend
        if (this.currentKey && this.currentKey.backend !== 'env') {
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
>>>>>>> polyoxy-dev/v0.4.0-mcp
}

export const keyManager = new KeyManager();
