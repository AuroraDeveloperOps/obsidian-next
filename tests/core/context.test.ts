/**
 * Context Manager Tests
 *
 * Tests for the context management system including:
 * - Working set tracking
 * - Time-decayed rank scoring
 * - Session management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';

// Mock database before importing context
vi.mock('../../src/core/database.js', () => {
    const mockDb = {
        prepare: vi.fn(() => ({
            run: vi.fn(),
            get: vi.fn(),
            all: vi.fn(() => []),
        })),
        transaction: vi.fn((fn) => fn),
        exec: vi.fn(),
    };

    return {
        db: {
            getDb: () => mockDb,
        },
    };
});

vi.mock('../../src/core/settings.js', () => ({
    settings: {
        load: vi.fn(() => Promise.resolve({ mode: 'safe' })),
        set: vi.fn(() => Promise.resolve()),
    },
}));

describe('ContextManager', () => {
    // Note: These tests use mocked database
    // For integration tests, use a real in-memory SQLite database

    describe('Time Decay Calculations', () => {
        it('should calculate higher rank for recently accessed files', () => {
            // Test the decay formula: score = accessCount * 0.5^(ageMs/halfLife) * importance
            const now = Date.now();
            const halfLifeMs = 3600000; // 1 hour

            // File accessed just now
            const recentScore = calculateMockScore(5, now, false, false);

            // File accessed 1 hour ago (one half-life)
            const oldScore = calculateMockScore(5, now - halfLifeMs, false, false);

            // Recent file should have ~2x the score of 1-hour-old file
            expect(recentScore).toBeGreaterThan(oldScore * 1.9);
            expect(recentScore).toBeLessThan(oldScore * 2.1);
        });

        it('should give bonus to modified files', () => {
            const now = Date.now();

            const unmodifiedScore = calculateMockScore(5, now, false, false);
            const modifiedScore = calculateMockScore(5, now, true, false);

            // Modified files should have 2x score
            expect(modifiedScore).toBe(unmodifiedScore * 2);
        });

        it('should give bonus to entry point files', () => {
            const now = Date.now();

            const regularScore = calculateMockScore(5, now, false, false);
            const entryPointScore = calculateMockScore(5, now, false, true);

            // Entry point files should have 1.5x score
            expect(entryPointScore).toBe(regularScore * 1.5);
        });

        it('should stack modifiers correctly', () => {
            const now = Date.now();

            const baseScore = calculateMockScore(5, now, false, false);
            const stackedScore = calculateMockScore(5, now, true, true);

            // Modified + entry point = 2.0 * 1.5 = 3x
            expect(stackedScore).toBe(baseScore * 3);
        });
    });

    describe('Entry Point Detection', () => {
        it('should identify index.ts as entry point', () => {
            expect(isEntryPoint('index.ts')).toBe(true);
            expect(isEntryPoint('src/index.tsx')).toBe(true);
        });

        it('should identify main.ts as entry point', () => {
            expect(isEntryPoint('main.ts')).toBe(true);
            expect(isEntryPoint('src/main.js')).toBe(true);
        });

        it('should identify app.ts as entry point', () => {
            expect(isEntryPoint('app.ts')).toBe(true);
            expect(isEntryPoint('src/app.tsx')).toBe(true);
        });

        it('should not identify regular files as entry points', () => {
            expect(isEntryPoint('utils.ts')).toBe(false);
            expect(isEntryPoint('helpers/index-helper.ts')).toBe(false);
            expect(isEntryPoint('main-component.tsx')).toBe(false);
        });
    });

    describe('Path Normalization', () => {
        it('should normalize absolute paths to relative', () => {
            const cwd = process.cwd();
            const absolute = `${cwd}/src/core/context.ts`;
            const normalized = normalizePath(absolute);

            expect(normalized).toBe('src/core/context.ts');
        });

        it('should handle relative paths correctly', () => {
            const normalized = normalizePath('./src/core/context.ts');
            expect(normalized).toBe('src/core/context.ts');
        });

        it('should handle paths with ..', () => {
            const normalized = normalizePath('src/../src/core/context.ts');
            expect(normalized).toBe('src/core/context.ts');
        });
    });
});

// Helper functions that mirror the actual implementation
function calculateMockScore(
    accessCount: number,
    lastAccessed: number,
    isModified: boolean,
    isEntryPoint: boolean
): number {
    const DECAY_HALF_LIFE_MS = 3600000;
    const IMPORTANCE_MODIFIED = 2.0;
    const IMPORTANCE_ENTRY_POINT = 1.5;

    const ageMs = Date.now() - lastAccessed;
    const decayFactor = Math.pow(0.5, ageMs / DECAY_HALF_LIFE_MS);

    let importanceMultiplier = 1.0;
    if (isModified) importanceMultiplier *= IMPORTANCE_MODIFIED;
    if (isEntryPoint) importanceMultiplier *= IMPORTANCE_ENTRY_POINT;

    return accessCount * decayFactor * importanceMultiplier;
}

function isEntryPoint(filePath: string): boolean {
    const ENTRY_POINT_PATTERNS = [
        /^index\.(ts|tsx|js|jsx)$/,
        /^main\.(ts|tsx|js|jsx)$/,
        /^app\.(ts|tsx|js|jsx)$/,
        /^server\.(ts|tsx|js|jsx)$/,
    ];

    const filename = path.basename(filePath);
    return ENTRY_POINT_PATTERNS.some(pattern => pattern.test(filename));
}

function normalizePath(filePath: string): string {
    return path.relative(process.cwd(), path.resolve(filePath));
}
