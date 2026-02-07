/**
 * Memory E2E Tests
 *
 * End-to-end tests for the memory system with real database:
 * - Persistence across sessions
 * - Semantic search with sqlite-vec
 * - MEMORY.md export/import
 * - Context injection
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Use actual database - not mocked
const OBSIDIAN_DIR = path.join(os.homedir(), '.obsidian-next');
const MEMORY_FILE = path.join(OBSIDIAN_DIR, 'MEMORY.md');
const DB_FILE = path.join(OBSIDIAN_DIR, 'state.db');

describe('Memory E2E', () => {
    let originalMemos: any[] = [];

    beforeAll(async () => {
        // Ensure directory exists
        await fs.mkdir(OBSIDIAN_DIR, { recursive: true });
    });

    describe('Memory Persistence', () => {
        it('should store a memory successfully', async () => {
            const { db } = await import('../../src/core/database.js');
            const { memory } = await import('../../src/core/memory.js');

            await memory.init();

            const result = await memory.store(
                'user_preference',
                'test_persistence_key',
                'Test persistence value for E2E'
            );

            expect(result).toBe(true);
        });

        it('should recall stored memory by key', async () => {
            const { memory } = await import('../../src/core/memory.js');

            await memory.init();

            // First store
            await memory.store(
                'user_preference',
                'recall_test_key',
                'Recall test value'
            );

            // Then recall
            const memo = await memory.recall('recall_test_key');

            expect(memo).not.toBeNull();
            expect(memo?.key).toBe('recall_test_key');
            expect(memo?.content).toBe('Recall test value');
            expect(memo?.type).toBe('user_preference');
        });

        it('should update existing memory on re-store', async () => {
            const { memory } = await import('../../src/core/memory.js');

            await memory.init();

            // Store initial
            await memory.store(
                'project_fact',
                'update_test_key',
                'Initial value'
            );

            // Update
            await memory.store(
                'project_fact',
                'update_test_key',
                'Updated value'
            );

            // Recall should return updated value
            const memo = await memory.recall('update_test_key');

            expect(memo?.content).toBe('Updated value');
        });
    });

    describe('Semantic Search', () => {
        beforeEach(async () => {
            const { memory } = await import('../../src/core/memory.js');
            await memory.init();

            // Store test memos for search
            await memory.store('project_fact', 'tech_react', 'This project uses React for the frontend UI');
            await memory.store('project_fact', 'tech_sqlite', 'The database is SQLite with WAL mode for concurrency');
            await memory.store('project_fact', 'tech_vitest', 'We use Vitest for running automated tests');
            await memory.store('learned_pattern', 'code_style', 'The user prefers TypeScript over JavaScript');
        });

        it('should search memories by keyword', async () => {
            const { memory } = await import('../../src/core/memory.js');

            const results = await memory.search('React');

            expect(results.length).toBeGreaterThan(0);
            expect(results.some(m => m.content.includes('React'))).toBe(true);
        });

        it('should search by type filter', async () => {
            const { memory } = await import('../../src/core/memory.js');

            const results = await memory.search('TypeScript', 'learned_pattern');

            expect(results.length).toBeGreaterThan(0);
            expect(results.every(m => m.type === 'learned_pattern')).toBe(true);
        });

        it('should return memories with getByType', async () => {
            const { memory } = await import('../../src/core/memory.js');

            const facts = await memory.getByType('project_fact');

            expect(facts.length).toBeGreaterThan(0);
            expect(facts.every(m => m.type === 'project_fact')).toBe(true);
        });
    });

    describe('Context Injection', () => {
        it('should generate user context string', async () => {
            const { memory } = await import('../../src/core/memory.js');

            await memory.init();

            // Store some preferences
            await memory.store('user_preference', 'user_name', 'TestUser');
            await memory.store('user_preference', 'coding_style', 'Prefers functional programming');

            const context = await memory.getUserContext();

            expect(context).toContain('[RECALL]');
            expect(context).toContain('user_name');
        });

        it('should return empty string when no memories', async () => {
            const { memory } = await import('../../src/core/memory.js');
            const { db } = await import('../../src/core/database.js');

            // Clear all memos
            await memory.clearAll();

            const context = await memory.getUserContext();

            expect(context).toBe('');
        });
    });

    describe('Memory Export', () => {
        it('should export memories to MEMORY.md', async () => {
            const { memory } = await import('../../src/core/memory.js');

            await memory.init();

            // Store test data
            await memory.store('user_preference', 'export_test', 'Export test value');

            const exportPath = await memory.exportToMarkdown();

            expect(exportPath).toBe(MEMORY_FILE);

            // Verify file exists
            const exists = await fs.access(MEMORY_FILE).then(() => true).catch(() => false);
            expect(exists).toBe(true);

            // Verify content
            const content = await fs.readFile(MEMORY_FILE, 'utf-8');
            expect(content).toContain('Obsidian Memory Bank');
            expect(content).toContain('User Preferences');
        });
    });

    describe('Memory Statistics', () => {
        it('should return accurate statistics', async () => {
            const { memory } = await import('../../src/core/memory.js');

            await memory.init();

            // Clear and add known count
            await memory.clearAll();
            await memory.store('user_preference', 'stat_test_1', 'Value 1');
            await memory.store('project_fact', 'stat_test_2', 'Value 2');
            await memory.store('project_fact', 'stat_test_3', 'Value 3');

            const stats = await memory.getStats();

            expect(stats.total).toBe(3);
            expect(stats.byType['user_preference']).toBe(1);
            expect(stats.byType['project_fact']).toBe(2);
        });
    });

    describe('Memory Deletion', () => {
        it('should forget a specific memory', async () => {
            const { memory } = await import('../../src/core/memory.js');

            await memory.init();

            // Store
            await memory.store('decision_log', 'forget_test', 'To be forgotten');

            // Verify stored
            let memo = await memory.recall('forget_test');
            expect(memo).not.toBeNull();

            // Forget
            const result = await memory.forget('forget_test');
            expect(result).toBe(true);

            // Verify gone
            memo = await memory.recall('forget_test');
            expect(memo).toBeNull();
        });
    });
});
