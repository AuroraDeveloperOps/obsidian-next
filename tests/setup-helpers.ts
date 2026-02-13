/**
 * Test Setup Helpers
 *
 * Shared utilities for setting up test environments consistently
 */

import { vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

const PROJECT_ROOT = process.cwd();

export interface TestWorkspaceSetup {
    workspace: string;
    cleanup: () => Promise<void>;
}

/**
 * Create a test workspace with proper auditor and settings configuration
 */
export async function setupTestWorkspace(name = 'test'): Promise<TestWorkspaceSetup> {
    // Create unique workspace inside project
    const workspace = path.join(PROJECT_ROOT, `.${name}-${Date.now()}`);
    await fs.mkdir(workspace, { recursive: true });

    // Configure auditor for test workspace
    const { auditor } = await import('../src/core/auditor.js');
    auditor.setWorkspaceRoot(workspace);

    // Mock settings to auto-approve all operations
    const { settings } = await import('../src/core/settings.js');
    vi.spyOn(settings, 'load').mockResolvedValue({
        mode: 'auto',
        animations: { enabled: false, frameDuration: 100 },
        permissions: {
            allowed: [],
            denied: [],
            session: [],
            unsandboxed: []
        }
    } as any);
    vi.spyOn(settings, 'isAllowed').mockResolvedValue(true);
    vi.spyOn(settings, 'isDenied').mockResolvedValue(false);
    vi.spyOn(settings, 'isSessionAuthorized').mockResolvedValue(true);
    vi.spyOn(settings, 'isUnsandboxed').mockResolvedValue(false);

    // Mock config to use test workspace
    const { config } = await import('../src/core/config.js');
    vi.spyOn(config, 'load').mockResolvedValue({
        workspaceRoot: workspace,
        anthropicApiKey: 'test-key',
        model: 'claude-sonnet-4-20250514'
    } as any);

    const cleanup = async () => {
        vi.restoreAllMocks();
        try {
            await fs.rm(workspace, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    };

    return { workspace, cleanup };
}

/**
 * Mock approval system to auto-approve in tests
 */
export function mockApprovalSystem() {
    vi.mock('../src/tools/shared.js', async () => {
        const actual = await vi.importActual('../src/tools/shared.js');
        return {
            ...actual,
            requestApproval: vi.fn().mockResolvedValue({
                approved: true,
                scope: 'session',
                bypass: false
            })
        };
    });
}

/**
 * Create test file in workspace
 */
export async function createTestFile(
    workspace: string,
    relativePath: string,
    content: string
): Promise<string> {
    const fullPath = path.join(workspace, relativePath);
    const dir = path.dirname(fullPath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content);

    return fullPath;
}

/**
 * Create realistic project structure for testing
 */
export async function createProjectStructure(workspace: string) {
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
    await fs.mkdir(path.join(workspace, 'tests'), { recursive: true });

    await createTestFile(
        workspace,
        'src/index.ts',
        `export function main() {
    console.log('Hello, World!');
}

export function add(a: number, b: number): number {
    return a + b;
}`
    );

    await createTestFile(
        workspace,
        'src/utils.ts',
        `export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}`
    );

    await createTestFile(
        workspace,
        'package.json',
        JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            main: 'dist/index.js'
        }, null, 2)
    );
}
