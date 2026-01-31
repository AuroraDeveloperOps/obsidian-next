import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SandboxExecutor } from '../src/core/sandbox.js';
import { settings } from '../src/core/settings.js';

describe('SandboxExecutor', () => {
    let sandbox: SandboxExecutor;

    beforeEach(() => {
        sandbox = new SandboxExecutor();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should initialize in local mode by default', async () => {
        // Mock default settings (sandbox: false)
        vi.spyOn(settings, 'load').mockResolvedValue({
            security: { sandbox: false }
        } as any);

        await sandbox.initialize();
        expect(sandbox.getMode()).toBe('local');
    });

    it('should return command as-is in local mode', async () => {
        vi.spyOn(settings, 'load').mockResolvedValue({
            security: { sandbox: false }
        } as any);

        await sandbox.initialize();
        const command = 'ls -la';
        const wrapped = await sandbox.wrapCommand(command);
        expect(wrapped).toBe(command);
    });

    it('should have default configuration', () => {
        const config = sandbox.getConfig();
        expect(config.mode).toBe('local');
        expect(config.allowedDomains).toContain('*.github.com');
        expect(config.denyRead).toContain('~/.ssh');
        expect(config.denyWrite).toContain('.env');
    });

    it('should update configuration', () => {
        sandbox.updateConfig({ allowedDomains: ['example.com'] });
        const config = sandbox.getConfig();
        expect(config.allowedDomains).toEqual(['example.com']);
    });

    it('should check if sandbox runtime is available', async () => {
        const available = await sandbox.isAvailable();
        // This will be true if @anthropic-ai/sandbox-runtime is installed
        expect(typeof available).toBe('boolean');
    });

    it('should reset sandbox state', async () => {
        vi.spyOn(settings, 'load').mockResolvedValue({
            security: { sandbox: false }
        } as any);

        await sandbox.initialize();
        await sandbox.reset();
        // After reset, initialization is needed again, but local mode is default if settings are off
        expect(sandbox.getMode()).toBe('local');
    });

    it('should respect settings.security.sandbox toggle', async () => {
        // Mock settings.load to return sandbox: true
        vi.spyOn(settings, 'load').mockResolvedValue({
            security: { sandbox: true }
        } as any);

        await sandbox.initialize();
        expect(sandbox.getMode()).toBe('sandbox');
    });

    it('should fallback to native sandbox if runtime missing', async () => {
        vi.spyOn(settings, 'load').mockResolvedValue({
            security: { sandbox: true }
        } as any);

        // This will fail to import @anthropic-ai/sandbox-runtime (not installed in test env usually)
        // But logic should keep mode as 'sandbox' and use native wrapper
        await sandbox.initialize();

        expect(sandbox.getMode()).toBe('sandbox');

        // Should wrap with sandbox-exec (macOS) or firejail (Linux) or at least try
        const cmd = 'echo test';
        const wrapped = await sandbox.wrapCommand(cmd);

        if (process.platform === 'darwin') {
            expect(wrapped).toContain('sandbox-exec');
        } else if (process.platform === 'linux') {
            // firejail might not be installed, so it might return raw command or firejail string
            // logic is: check if firejail exists. If not, return command. 
            // verifying logic path is tricky without mocking child_process.exec
        }
    });
});
