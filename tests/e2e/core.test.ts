import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commands } from '../../src/core/commands.js';
import { bus } from '../../src/core/bus.js';
import { auditor } from '../../src/core/auditor.js';
import path from 'path';

describe('Obsidian Next E2E: Unified Command System', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should route commands to views and emit events', async () => {
        const spy = vi.fn();
        bus.on('agent', spy);

        await commands.execute('settings', []);

        // Should emit view_request
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'view_request',
            viewId: 'settings'
        }));

        // Should emit command_executed
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'command_executed',
            command: 'settings'
        }));
    });

    it('should handle aliases correctly (e.g., /plugin -> /mcp)', async () => {
        const spy = vi.fn();
        bus.on('agent', spy);

        await commands.execute('plugin', []);

        expect(spy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'view_request',
            viewId: 'mcp',
            command: 'mcp'
        }));

        expect(spy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'command_executed',
            command: 'mcp'
        }));
    });

    it('should pass command name for tab routing in settings', async () => {
        const spy = vi.fn();
        bus.on('agent', spy);

        await commands.execute('models', []);

        expect(spy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'view_request',
            viewId: 'settings',
            command: 'models'
        }));
    });
});

describe('Obsidian Next E2E: Security Auditor', () => {
    it('should block path traversal outside workspace', () => {
        const result = auditor.checkPath('../../../etc/passwd');
        expect(result.approved).toBe(false);
        expect(result.isCritical).toBe(true);
        expect(result.reason).toContain('outside the workspace');
    });

    it('should allow paths within workspace', () => {
        const result = auditor.checkPath('src/index.ts');
        expect(result.approved).toBe(true);
    });

    it('should block dangerous shell patterns', async () => {
        const result = await auditor.checkCommand('rm -rf /');
        expect(result.approved).toBe(false);
        expect(result.isCritical).toBe(true);
    });
});
