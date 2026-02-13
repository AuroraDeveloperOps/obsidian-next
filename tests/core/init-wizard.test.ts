/**
 * Init Wizard Tests
 *
 * Tests for setup-helpers utility functions used by the onboarding wizard.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateKeyFormat } from '../../src/utils/setup-helpers.js';

describe('InitWizard - Setup Helpers', () => {
	describe('validateKeyFormat', () => {
		it('accepts valid Anthropic API key format', () => {
			const validKey = 'sk-ant-' + 'a'.repeat(90);
			expect(validateKeyFormat(validKey)).toBe(true);
		});

		it('rejects keys without sk-ant- prefix', () => {
			expect(validateKeyFormat('sk-' + 'a'.repeat(90))).toBe(false);
			expect(validateKeyFormat('invalid-key')).toBe(false);
			expect(validateKeyFormat('')).toBe(false);
		});

		it('rejects keys that are too short', () => {
			expect(validateKeyFormat('sk-ant-short')).toBe(false);
			expect(validateKeyFormat('sk-ant-' + 'a'.repeat(10))).toBe(false);
		});

		it('accepts keys at minimum length boundary', () => {
			// sk-ant- is 7 chars, key must be >= 40 total
			const key = 'sk-ant-' + 'a'.repeat(33);
			expect(key.length).toBe(40);
			expect(validateKeyFormat(key)).toBe(true);
		});

		it('rejects keys just below minimum length', () => {
			const key = 'sk-ant-' + 'a'.repeat(32);
			expect(key.length).toBe(39);
			expect(validateKeyFormat(key)).toBe(false);
		});
	});

	describe('detectOllama', () => {
		it('returns unavailable for unreachable host', async () => {
			const { detectOllama } = await import('../../src/utils/setup-helpers.js');
			// Use a port unlikely to have anything running
			const result = await detectOllama('localhost', 59999);
			expect(result.available).toBe(false);
			expect(result.models).toEqual([]);
			expect(result.error).toBeTruthy();
		});
	});
});
