/**
 * API client initialization and management
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { bus } from '../bus.js';
import { usage } from '../usage.js';
import { keyManager, detectEnvFile } from '../keyManager.js';

export interface ClientConfig {
	model: string;
	maxTokens: number;
	summarizerModel: string;
	preCountTokens: boolean;
}

/**
 * Initialize the Anthropic API client
 */
export async function initializeClient(): Promise<{
	client: Anthropic | null;
	config: ClientConfig | null;
}> {
	const cfg = await config.load();
	await usage.init();

	const envFileCheck = await detectEnvFile(cfg.workspaceRoot);
	if (envFileCheck.found) {
		bus.emitAgent({
			type: 'thought',
			content: `[WARN] Found .env file with API key at ${envFileCheck.path}. For security, run /init to migrate to secure storage.`,
			hidden: false
		});
	}

	if (config.hasDeprecatedKey()) {
		const deprecatedKey = config.getDeprecatedApiKey();
		if (deprecatedKey) {
			bus.emitAgent({
				type: 'thought',
				content:
					'[WARN] Found API key in config file. Migrating to secure storage...',
				hidden: false
			});

			const result = await keyManager.storeKey(deprecatedKey);
			if (result.success) {
				await config.removeApiKeyFromConfig();
				bus.emitAgent({
					type: 'thought',
					content: `[INFO] API key migrated to ${result.backend}. Config file cleaned.`,
					hidden: false
				});
			}
		}
	}

	const apiKey = await keyManager.loadKey();

	if (!apiKey) {
		bus.emitAgent({
			type: 'error',
			message:
				'Missing API key. Run /init to set up secure key storage, or set ANTHROPIC_API_KEY environment variable.'
		});
		return { client: null, config: null };
	}

	const client = new Anthropic({ apiKey });
	const backend = keyManager.getBackend();
	if (backend && backend !== 'env') {
		bus.emitAgent({
			type: 'thought',
			content: `[INFO] API key loaded from: ${backend}`,
			hidden: true
		});
	}

	return {
		client,
		config: {
			model: cfg.model || 'claude-opus-4-6-20260207',
			maxTokens: cfg.maxTokens || 8192,
			summarizerModel: cfg.summarizerModel || 'claude-haiku-4-5-20251001',
			preCountTokens: cfg.preCountTokens !== false
		}
	};
}

/**
 * Refresh the API client if key has rotated
 */
export async function refreshClient(
	currentClient: Anthropic
): Promise<Anthropic | null> {
	if (keyManager.shouldRotate()) {
		const newKey = await keyManager.refreshKey();
		if (newKey) {
			return new Anthropic({ apiKey: newKey });
		}
	}
	return null;
}
