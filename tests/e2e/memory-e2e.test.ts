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

    describe('Memory Graph - Relationships', () => {
        beforeEach(async () => {
            const { memory } = await import('../../src/core/memory.js');
            await memory.init();
            await memory.clearAll();

            // Set up related memos
            await memory.store('user_preference', 'prefers_typescript', 'User prefers TypeScript');
            await memory.store('learned_pattern', 'uses_vitest', 'Uses Vitest for testing');
            await memory.store('project_fact', 'test_framework', 'Project uses Vitest with TypeScript');
        });

        it('should add relationships between memos', async () => {
            const { memory } = await import('../../src/core/memory.js');

            const result = await memory.addRelation(
                'prefers_typescript',
                'test_framework',
                'related_to',
                0.8
            );

            expect(result).toBe(true);
        });

        it('should retrieve relationships for a memo', async () => {
            const { memory } = await import('../../src/core/memory.js');

            // Add relations
            await memory.addRelation('prefers_typescript', 'test_framework', 'related_to', 0.9);
            await memory.addRelation('uses_vitest', 'test_framework', 'derived_from', 0.85);

            const relations = await memory.getRelations('test_framework');

            expect(relations.length).toBeGreaterThanOrEqual(2);
            expect(relations.some(r => r.relationType === 'related_to')).toBe(true);
            expect(relations.some(r => r.relationType === 'derived_from')).toBe(true);
        });

        it('should get related memos with their relationships', async () => {
            const { memory } = await import('../../src/core/memory.js');

            await memory.addRelation('test_framework', 'prefers_typescript', 'related_to', 0.9);

            const relatedMemos = await memory.getRelatedMemos('test_framework');

            expect(relatedMemos.length).toBeGreaterThan(0);
            expect(relatedMemos[0].memo.key).toBe('prefers_typescript');
            expect(relatedMemos[0].relation.relationType).toBe('related_to');
        });
    });

    describe('Memory Graph - Temporal Decay', () => {
        it('should calculate relevance score with decay', async () => {
            const { memory } = await import('../../src/core/memory.js');

            // Create a memo with recent access
            const recentMemo = {
                id: 1,
                type: 'user_preference' as const,
                key: 'recent',
                content: 'Recent',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                access_count: 5,
                last_accessed: new Date().toISOString(),
            };

            // Create a memo with old access (30 days ago)
            const oldAccess = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const oldMemo = {
                id: 2,
                type: 'user_preference' as const,
                key: 'old',
                content: 'Old',
                created_at: oldAccess.toISOString(),
                updated_at: oldAccess.toISOString(),
                access_count: 1,
                last_accessed: oldAccess.toISOString(),
            };

            const recentScore = memory.getRelevanceScore(recentMemo);
            const oldScore = memory.getRelevanceScore(oldMemo);

            // Recent memo should score higher
            expect(recentScore).toBeGreaterThan(oldScore);

            // Recent score should be close to 1.2 (base 1.0 + frequency boost for 5 accesses)
            expect(recentScore).toBeGreaterThan(1.0);

            // Old score should be decayed significantly (30 days = ~4 half-lives)
            expect(oldScore).toBeLessThan(0.2);
        });

        it('should update access stats when accessing memo', async () => {
            const { memory } = await import('../../src/core/memory.js');

            await memory.init();
            await memory.store('user_preference', 'access_test', 'Test access stats');

            // Initial recall
            const initial = await memory.recall('access_test');
            const initialCount = initial?.access_count || 0;

            // Update access stats
            await memory.updateAccessStats('access_test');

            // Check updated
            const updated = await memory.recall('access_test');

            expect(updated?.access_count).toBe(initialCount + 1);
            expect(updated?.last_accessed).toBeDefined();
        });
    });

    describe('Memory Graph - Relationship-Aware Search', () => {
        beforeEach(async () => {
            const { memory } = await import('../../src/core/memory.js');
            await memory.init();
            await memory.clearAll();

            // Create related memos
            await memory.store('project_fact', 'api_design', 'REST API follows OpenAPI spec');
            await memory.store('project_fact', 'auth_method', 'Uses JWT tokens for authentication');
            await memory.store('decision_log', 'auth_decision', 'Chose JWT over sessions for stateless auth');

            // Add relations
            await memory.addRelation('auth_method', 'auth_decision', 'derived_from', 0.95);
            await memory.addRelation('api_design', 'auth_method', 'related_to', 0.7);
        });

        it('should search with relationship awareness', async () => {
            const { memory } = await import('../../src/core/memory.js');

            const results = await memory.searchWithRelations('authentication');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0]).toHaveProperty('memo');
            expect(results[0]).toHaveProperty('score');
            expect(results[0]).toHaveProperty('related');
        });

        it('should return related memos in search results', async () => {
            const { memory } = await import('../../src/core/memory.js');

            const results = await memory.searchWithRelations('JWT authentication');

            // Find the auth_method result
            const authResult = results.find(r => r.memo.key === 'auth_method');

            if (authResult) {
                // Should include auth_decision as related (derived_from relation)
                expect(authResult.related.length).toBeGreaterThan(0);
            }
        });

        it('should sort results by relevance score', async () => {
            const { memory } = await import('../../src/core/memory.js');

            // Access one memo multiple times to boost its score
            await memory.updateAccessStats('auth_method');
            await memory.updateAccessStats('auth_method');
            await memory.updateAccessStats('auth_method');

            const results = await memory.searchWithRelations('authentication');

            // Results should be sorted by score descending
            for (let i = 1; i < results.length; i++) {
                expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
            }
        });
    });
});
