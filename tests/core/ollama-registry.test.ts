/**
 * Ollama Registry Tests
 *
 * Tests for:
 * - Curated model registry queries
 * - Model filtering by capability
 * - Cloud model variants (Ollama Cloud)
 * - Search functionality
 */

import { describe, it, expect } from 'vitest';
import {
	getCuratedModels,
	getRecommendedModels,
	getModelsByCapability,
	getCloudModels,
	getLocalModels,
	searchModels,
} from '../../src/core/ollama-registry.js';

describe('OllamaRegistry', () => {
	describe('getCuratedModels', () => {
		it('returns all curated models', () => {
			const models = getCuratedModels();
			expect(models.length).toBeGreaterThan(0);
			expect(models.length).toBeGreaterThanOrEqual(10);
		});

		it('each model has required fields', () => {
			const models = getCuratedModels();
			for (const model of models) {
				expect(model.name).toBeTruthy();
				expect(model.displayName).toBeTruthy();
				expect(model.family).toBeTruthy();
				expect(model.size).toBeTruthy();
				expect(model.capabilities).toBeDefined();
				expect(typeof model.capabilities.tools).toBe('boolean');
				expect(typeof model.capabilities.vision).toBe('boolean');
				expect(typeof model.capabilities.reasoning).toBe('boolean');
				expect(typeof model.recommended).toBe('boolean');
				expect(model.description).toBeTruthy();
				expect(model.minRAM).toBeTruthy();
			}
		});
	});

	describe('getRecommendedModels', () => {
		it('returns only recommended models', () => {
			const models = getRecommendedModels();
			expect(models.length).toBeGreaterThan(0);
			for (const model of models) {
				expect(model.recommended).toBe(true);
			}
		});

		it('returns fewer models than full registry', () => {
			const all = getCuratedModels();
			const recommended = getRecommendedModels();
			expect(recommended.length).toBeLessThan(all.length);
		});
	});

	describe('getModelsByCapability', () => {
		it('filters by tools capability', () => {
			const models = getModelsByCapability('tools');
			expect(models.length).toBeGreaterThan(0);
			for (const model of models) {
				expect(model.capabilities.tools).toBe(true);
			}
		});

		it('filters by vision capability', () => {
			const models = getModelsByCapability('vision');
			expect(models.length).toBeGreaterThan(0);
			for (const model of models) {
				expect(model.capabilities.vision).toBe(true);
			}
		});

		it('filters by reasoning capability', () => {
			const models = getModelsByCapability('reasoning');
			for (const model of models) {
				expect(model.capabilities.reasoning).toBe(true);
			}
		});
	});

	describe('cloud models', () => {
		it('returns cloud models from real Ollama Cloud catalog', () => {
			const cloud = getCloudModels();
			expect(cloud.length).toBeGreaterThan(0);
		});

		it('all cloud models have cloud suffix in name (-cloud or :cloud)', () => {
			const cloud = getCloudModels();
			for (const model of cloud) {
				expect(model.name).toMatch(/cloud/);
			}
		});

		it('all cloud models have cloud flag set to true', () => {
			const cloud = getCloudModels();
			for (const model of cloud) {
				expect(model.cloud).toBe(true);
			}
		});

		it('cloud models require 0GB RAM and 0GB size', () => {
			const cloud = getCloudModels();
			for (const model of cloud) {
				expect(model.size).toBe('0GB');
				expect(model.minRAM).toBe('0GB');
			}
		});

		it('cloud models have (Cloud) in display name', () => {
			const cloud = getCloudModels();
			for (const model of cloud) {
				expect(model.displayName).toContain('(Cloud)');
			}
		});

		it('includes known Ollama Cloud models', () => {
			const cloud = getCloudModels();
			const names = cloud.map((m) => m.name);
			// These are real models from https://ollama.com/search?c=cloud
			expect(names.some((n) => n.includes('deepseek'))).toBe(true);
			expect(names.some((n) => n.includes('qwen3'))).toBe(true);
		});

		it('local models do not have cloud flag', () => {
			const local = getLocalModels();
			for (const model of local) {
				expect(model.cloud).toBeFalsy();
			}
		});

		it('cloud + local = all models', () => {
			const all = getCuratedModels();
			const cloud = getCloudModels();
			const local = getLocalModels();
			expect(cloud.length + local.length).toBe(all.length);
		});
	});

	describe('searchModels', () => {
		it('finds models by name', () => {
			const results = searchModels('qwen');
			expect(results.length).toBeGreaterThan(0);
			for (const model of results) {
				const matches =
					model.name.toLowerCase().includes('qwen') ||
					model.family.toLowerCase().includes('qwen') ||
					model.displayName.toLowerCase().includes('qwen');
				expect(matches).toBe(true);
			}
		});

		it('finds models by family', () => {
			const results = searchModels('llama');
			expect(results.length).toBeGreaterThan(0);
		});

		it('finds models by family - gemma', () => {
			const results = searchModels('gemma');
			expect(results.length).toBeGreaterThan(0);
		});

		it('finds cloud models when searching "cloud"', () => {
			const results = searchModels('cloud');
			expect(results.length).toBeGreaterThan(0);
			for (const model of results) {
				expect(
					model.name.includes('cloud') ||
					model.description.toLowerCase().includes('cloud') ||
					model.displayName.includes('Cloud')
				).toBe(true);
			}
		});

		it('returns empty for non-matching query', () => {
			const results = searchModels('nonexistentmodel12345');
			expect(results.length).toBe(0);
		});

		it('is case-insensitive', () => {
			const lower = searchModels('qwen');
			const upper = searchModels('QWEN');
			expect(lower.length).toBe(upper.length);
		});
	});
});
