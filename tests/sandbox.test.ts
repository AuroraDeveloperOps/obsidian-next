import { describe, it, expect, beforeEach } from 'vitest';
import { SandboxExecutor } from '../src/core/sandbox.js';

describe('SandboxExecutor', () => {
    let sandbox: SandboxExecutor;

    beforeEach(() => {
        sandbox = new SandboxExecutor();
    });

    it('should initialize in local mode by default', async () => {
        await sandbox.initialize();
        expect(sandbox.getMode()).toBe('local');
    });

    it('should return command as-is in local mode', async () => {
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
        await sandbox.initialize();
        await sandbox.reset();
        // After reset, mode should stay at local (default)
        expect(sandbox.getMode()).toBe('local');
    });
});
