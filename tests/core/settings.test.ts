/**
 * Settings Manager Tests
 *
 * Comprehensive tests for:
 * - Permission management (allow/deny lists)
 * - Session vs persistent permissions
 * - Pattern matching for tools and commands
 * - Security settings validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('SettingsManager', () => {
    let testDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        // Create temp directory for tests
        testDir = path.join(os.tmpdir(), `settings-test-${Date.now()}`);
        await fs.mkdir(testDir, { recursive: true });
        await fs.mkdir(path.join(testDir, '.obsidian'), { recursive: true });

        // Store original cwd and change to test dir
        originalCwd = process.cwd();
        process.chdir(testDir);

        // Reset modules to get fresh instances
        vi.resetModules();
    });

    afterEach(async () => {
        // Restore original cwd
        process.chdir(originalCwd);

        // Clean up temp directory
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('Default Settings', () => {
        it('should create default settings file on first load', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            const loaded = await settings.load();

            expect(loaded.mode).toBe('safe');
            expect(loaded.autoAccept.enabled).toBe(false);
            expect(loaded.permissions.allow).toEqual([]);
            expect(loaded.permissions.deny).toEqual([]);
            expect(loaded.security.piiRedaction).toBe(true);
        });

        it('should persist settings to disk', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.load();

            // Check file exists
            const filePath = path.join(testDir, '.obsidian', 'settings.json');
            const exists = await fs.access(filePath).then(() => true).catch(() => false);
            expect(exists).toBe(true);
        });
    });

    describe('Permission Management', () => {
        it('should add persistent allowed permission', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.addAllowedPermission('bash', 'npm test');
            const loaded = await settings.reload();

            expect(loaded.permissions.allow).toContain('bash:npm test');
        });

        it('should add persistent denied permission', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.addDeniedPermission('bash', 'rm -rf /');
            const loaded = await settings.reload();

            expect(loaded.permissions.deny).toContain('bash:rm -rf /');
        });

        it('should check allowed permissions correctly', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.addAllowedPermission('bash', 'npm install');
            const allowed = await settings.isAllowed('bash', 'npm install');

            expect(allowed).toBe(true);
        });

        it('should deny takes precedence over allow', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.addAllowedPermission('bash', 'rm *');
            await settings.addDeniedPermission('bash', 'rm *');
            const allowed = await settings.isAllowed('bash', 'rm *');

            expect(allowed).toBe(false);
        });

        it('should return false for unknown permissions', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            const allowed = await settings.isAllowed('bash', 'some-unknown-command');

            expect(allowed).toBe(false);
        });
    });

    describe('Session Permissions', () => {
        it('should track session-only allow', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.addSessionPermission('bash', 'echo test', true);
            const sessionAuth = await settings.isSessionAuthorized('bash', 'echo test');
            const allowed = await settings.isAllowed('bash', 'echo test');

            expect(sessionAuth).toBe(true);
            expect(allowed).toBe(true);
        });

        it('should track session-only deny', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.addSessionPermission('bash', 'dangerous-cmd', false);
            const denied = await settings.isDenied('bash', 'dangerous-cmd');

            expect(denied).toBe(true);
        });

        it('should track session sandbox bypass', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.addSessionPermission('bash', 'npm install', true, true);
            const unsandboxed = await settings.isUnsandboxed('bash', 'npm install');

            expect(unsandboxed).toBe(true);
        });

        it('should not persist session permissions to disk', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.addSessionPermission('bash', 'session-only', true);

            // Reload from disk
            const loaded = await settings.reload();

            // Session permission should not be in persistent list
            expect(loaded.permissions.allow).not.toContain('bash:session-only');
        });
    });

    describe('Pattern Matching', () => {
        it('should match exact patterns', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.addAllowedPermission('bash', 'npm test');
            const allowed = await settings.isAllowed('bash', 'npm test');

            expect(allowed).toBe(true);
        });

        it('should match wildcard patterns', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.addAllowedPermission('bash', 'npm *');
            const allowed1 = await settings.isAllowed('bash', 'npm test');
            const allowed2 = await settings.isAllowed('bash', 'npm install');
            const allowed3 = await settings.isAllowed('bash', 'yarn test');

            expect(allowed1).toBe(true);
            expect(allowed2).toBe(true);
            expect(allowed3).toBe(false);
        });

        it('should not allow partial matches without wildcard', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.addAllowedPermission('bash', 'npm');
            const allowed = await settings.isAllowed('bash', 'npm test');

            expect(allowed).toBe(false);
        });
    });

    describe('Unsandboxed Permissions', () => {
        it('should add to both allow and unsandboxed lists', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.addUnsandboxedPermission('bash', 'sudo apt-get update');
            const loaded = await settings.reload();

            expect(loaded.permissions.allow).toContain('bash:sudo apt-get update');
            expect(loaded.permissions.allowUnsandboxed).toContain('bash:sudo apt-get update');
        });

        it('should check unsandboxed status correctly', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.addUnsandboxedPermission('bash', 'docker run');
            const unsandboxed = await settings.isUnsandboxed('bash', 'docker run');

            expect(unsandboxed).toBe(true);
        });
    });

    describe('Mode Settings', () => {
        it('should default to safe mode', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            const mode = await settings.get('mode');

            expect(mode).toBe('safe');
        });

        it('should allow changing mode', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.set('mode', 'auto');
            const mode = await settings.get('mode');

            expect(mode).toBe('auto');
        });
    });

    describe('Security Settings', () => {
        it('should enable PII redaction by default', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            const security = await settings.get('security');

            expect(security.piiRedaction).toBe(true);
        });

        it('should enable audit logging by default', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            const security = await settings.get('security');

            expect(security.auditLogging).toBe(true);
        });

        it('should preserve security settings on partial update', async () => {
            const { settings } = await import('../../src/core/settings.js');
            settings.clearCache();

            await settings.save({ mode: 'plan' });
            const security = await settings.get('security');

            expect(security.piiRedaction).toBe(true);
            expect(security.auditLogging).toBe(true);
        });
    });
});
