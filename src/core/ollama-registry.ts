/**
 * Ollama Model Registry
 *
 * Curated registry of recommended Ollama models with capability metadata,
 * plus support for remote Ollama endpoints with authentication.
 */

import { config } from './config.js';

export interface OllamaModelEntry {
	name: string;
	displayName: string;
	family: string;
	size: string;
	capabilities: {
		tools: boolean;
		vision: boolean;
		reasoning: boolean;
	};
	recommended: boolean;
	description: string;
	minRAM: string;
	cloud?: boolean; // Available via Ollama Cloud (remote inference, no local download)
}

export interface OllamaEndpoint {
	id: string;
	name: string;
	host: string;
	port: number;
	auth?: {
		type: 'basic' | 'bearer';
		token?: string;
	};
	isDefault: boolean;
}

// Curated registry of recommended models (2026 lineup)
const CURATED_MODELS: OllamaModelEntry[] = [
	// Recommended (tool-capable, efficient)
	{
		name: 'qwen3:8b',
		displayName: 'Qwen 3 8B',
		family: 'qwen3',
		size: '4.9GB',
		capabilities: { tools: true, vision: false, reasoning: true },
		recommended: true,
		description: 'Best coding/tool model in class, hybrid thinking.',
		minRAM: '8GB'
	},
	{
		name: 'gemma3:12b',
		displayName: 'Gemma 3 12B',
		family: 'gemma3',
		size: '7.6GB',
		capabilities: { tools: true, vision: true, reasoning: true },
		recommended: true,
		description: 'Google latest, multimodal with tool support.',
		minRAM: '16GB'
	},
	{
		name: 'llama3.3:8b',
		displayName: 'Llama 3.3 8B',
		family: 'llama3.3',
		size: '4.9GB',
		capabilities: { tools: true, vision: false, reasoning: true },
		recommended: true,
		description: 'Meta latest instruct model, strong general-purpose.',
		minRAM: '8GB'
	},
	// Vision + Multimodal
	{
		name: 'llama3.2-vision:11b',
		displayName: 'Llama 3.2 Vision 11B',
		family: 'llama3.2',
		size: '6.6GB',
		capabilities: { tools: true, vision: true, reasoning: true },
		recommended: false,
		description: 'Multimodal model with image understanding.',
		minRAM: '16GB'
	},
	// Reasoning Specialists
	{
		name: 'qwq:32b',
		displayName: 'QwQ 32B',
		family: 'qwq',
		size: '19GB',
		capabilities: { tools: false, vision: false, reasoning: true },
		recommended: false,
		description: 'Deep reasoning, chain-of-thought specialist.',
		minRAM: '32GB'
	},
	{
		name: 'deepseek-r1:14b',
		displayName: 'DeepSeek-R1 14B',
		family: 'deepseek-r1',
		size: '8.5GB',
		capabilities: { tools: false, vision: false, reasoning: true },
		recommended: false,
		description: 'Strong reasoning distill, excellent math/code.',
		minRAM: '16GB'
	},
	{
		name: 'phi4:14b',
		displayName: 'Phi-4 14B',
		family: 'phi4',
		size: '8.5GB',
		capabilities: { tools: true, vision: false, reasoning: true },
		recommended: false,
		description: 'Microsoft reasoning model, strong on STEM.',
		minRAM: '16GB'
	},
	// Large/Advanced
	{
		name: 'qwen3:32b',
		displayName: 'Qwen 3 32B',
		family: 'qwen3',
		size: '19GB',
		capabilities: { tools: true, vision: false, reasoning: true },
		recommended: false,
		description: 'Top-tier tool use at scale, hybrid thinking.',
		minRAM: '32GB'
	},
	{
		name: 'glm4:9b',
		displayName: 'GLM-4 9B',
		family: 'glm4',
		size: '5.5GB',
		capabilities: { tools: true, vision: false, reasoning: true },
		recommended: false,
		description: 'Strong Chinese/English bilingual model.',
		minRAM: '8GB'
	},
	{
		name: 'command-a:111b',
		displayName: 'Command-A 111B',
		family: 'command-a',
		size: '65GB',
		capabilities: { tools: true, vision: false, reasoning: true },
		recommended: false,
		description: 'Cohere agent model, needs 64GB+ RAM.',
		minRAM: '64GB'
	},
	// Small/Fast
	{
		name: 'qwen3:4b',
		displayName: 'Qwen 3 4B',
		family: 'qwen3',
		size: '2.6GB',
		capabilities: { tools: true, vision: false, reasoning: false },
		recommended: false,
		description: 'Fast, tool-capable, minimal footprint.',
		minRAM: '4GB'
	},
	{
		name: 'llama3.2:3b',
		displayName: 'Llama 3.2 3B',
		family: 'llama3.2',
		size: '2.0GB',
		capabilities: { tools: true, vision: false, reasoning: false },
		recommended: false,
		description: 'Lightweight model for quick inference.',
		minRAM: '4GB'
	},
	{
		name: 'gemma3:4b',
		displayName: 'Gemma 3 4B',
		family: 'gemma3',
		size: '2.5GB',
		capabilities: { tools: true, vision: true, reasoning: false },
		recommended: false,
		description: 'Compact multimodal, surprisingly capable.',
		minRAM: '4GB'
	},
	// Cloud models - real Ollama Cloud catalog (remote inference, requires ollama signin)
	// See: https://ollama.com/search?c=cloud
	{
		name: 'deepseek-v3.1:671b-cloud',
		displayName: 'DeepSeek V3.1 671B (Cloud)',
		family: 'deepseek-v3',
		size: '0GB',
		capabilities: { tools: true, vision: false, reasoning: true },
		recommended: false,
		description: 'DeepSeek V3.1 671B via Ollama Cloud. Tool use + thinking.',
		minRAM: '0GB',
		cloud: true
	},
	{
		name: 'qwen3-coder-next:cloud',
		displayName: 'Qwen3 Coder Next (Cloud)',
		family: 'qwen3-coder-next',
		size: '0GB',
		capabilities: { tools: true, vision: false, reasoning: true },
		recommended: false,
		description: 'Alibaba coding model via Ollama Cloud. 256K context.',
		minRAM: '0GB',
		cloud: true
	},
	{
		name: 'qwen3-next:cloud',
		displayName: 'Qwen3 Next 80B (Cloud)',
		family: 'qwen3-next',
		size: '0GB',
		capabilities: { tools: true, vision: false, reasoning: true },
		recommended: false,
		description: 'Qwen3 Next MoE via Ollama Cloud. Tool use + thinking.',
		minRAM: '0GB',
		cloud: true
	},
	{
		name: 'devstral-2:cloud',
		displayName: 'Devstral 2 123B (Cloud)',
		family: 'devstral',
		size: '0GB',
		capabilities: { tools: true, vision: false, reasoning: false },
		recommended: false,
		description: 'Mistral coding agent via Ollama Cloud. 128K context.',
		minRAM: '0GB',
		cloud: true
	},
	{
		name: 'gemini-3-flash-preview:cloud',
		displayName: 'Gemini 3 Flash Preview (Cloud)',
		family: 'gemini',
		size: '0GB',
		capabilities: { tools: true, vision: true, reasoning: true },
		recommended: false,
		description: 'Google Gemini 3 Flash via Ollama Cloud. Multimodal.',
		minRAM: '0GB',
		cloud: true
	},
	{
		name: 'qwen3-vl:cloud',
		displayName: 'Qwen3 VL (Cloud)',
		family: 'qwen3-vl',
		size: '0GB',
		capabilities: { tools: true, vision: true, reasoning: true },
		recommended: false,
		description: 'Qwen3 vision-language via Ollama Cloud. Multimodal + thinking.',
		minRAM: '0GB',
		cloud: true
	},
	{
		name: 'nemotron-3-nano:cloud',
		displayName: 'Nemotron 3 Nano 30B (Cloud)',
		family: 'nemotron',
		size: '0GB',
		capabilities: { tools: true, vision: false, reasoning: true },
		recommended: false,
		description: 'NVIDIA Nemotron via Ollama Cloud. Tool use + thinking.',
		minRAM: '0GB',
		cloud: true
	},
	{
		name: 'glm-5:cloud',
		displayName: 'GLM-5 (Cloud)',
		family: 'glm',
		size: '0GB',
		capabilities: { tools: true, vision: false, reasoning: true },
		recommended: false,
		description: 'Zhipu GLM-5 via Ollama Cloud.',
		minRAM: '0GB',
		cloud: true
	}
];

// Default endpoint
const DEFAULT_ENDPOINT: OllamaEndpoint = {
	id: 'local',
	name: 'Local',
	host: 'localhost',
	port: 11434,
	isDefault: true
};

/**
 * Get all curated models
 */
export function getCuratedModels(): OllamaModelEntry[] {
	return CURATED_MODELS;
}

/**
 * Get recommended models only
 */
export function getRecommendedModels(): OllamaModelEntry[] {
	return CURATED_MODELS.filter((m) => m.recommended);
}

/**
 * Get cloud-hosted models (remote inference, no local download)
 */
export function getCloudModels(): OllamaModelEntry[] {
	return CURATED_MODELS.filter((m) => m.cloud === true);
}

/**
 * Get local-only models (excludes cloud variants)
 */
export function getLocalModels(): OllamaModelEntry[] {
	return CURATED_MODELS.filter((m) => !m.cloud);
}

/**
 * Get models filtered by capability
 */
export function getModelsByCapability(
	cap: 'tools' | 'vision' | 'reasoning'
): OllamaModelEntry[] {
	return CURATED_MODELS.filter((m) => m.capabilities[cap]);
}

/**
 * Search models by name or description
 */
export function searchModels(query: string): OllamaModelEntry[] {
	const q = query.toLowerCase();
	return CURATED_MODELS.filter(
		(m) =>
			m.name.toLowerCase().includes(q) ||
			m.displayName.toLowerCase().includes(q) ||
			m.description.toLowerCase().includes(q) ||
			m.family.toLowerCase().includes(q)
	);
}

/**
 * Get configured endpoints (from config or defaults)
 */
export async function getEndpoints(): Promise<OllamaEndpoint[]> {
	const cfg = await config.load();
	const endpoints = (cfg as any).ollama?.endpoints;
	if (Array.isArray(endpoints) && endpoints.length > 0) {
		return endpoints;
	}
	// Build default from existing baseUrl
	const baseUrl = cfg.ollama?.baseUrl || 'http://localhost:11434';
	try {
		const url = new URL(baseUrl);
		return [{
			id: 'local',
			name: 'Local',
			host: url.hostname,
			port: parseInt(url.port) || 11434,
			isDefault: true
		}];
	} catch {
		return [DEFAULT_ENDPOINT];
	}
}

/**
 * Add a new endpoint
 */
export async function addEndpoint(endpoint: OllamaEndpoint): Promise<void> {
	const endpoints = await getEndpoints();
	endpoints.push(endpoint);
	const cfg = await config.load();
	const newConfig = { ...cfg } as any;
	if (!newConfig.ollama) newConfig.ollama = {};
	newConfig.ollama.endpoints = endpoints;
	await config.save(newConfig);
}

/**
 * Remove an endpoint by ID
 */
export async function removeEndpoint(id: string): Promise<void> {
	const endpoints = await getEndpoints();
	const filtered = endpoints.filter((e) => e.id !== id);
	const cfg = await config.load();
	const newConfig = { ...cfg } as any;
	if (!newConfig.ollama) newConfig.ollama = {};
	newConfig.ollama.endpoints = filtered;
	await config.save(newConfig);
}

/**
 * Test connectivity to an endpoint
 */
export async function testEndpoint(endpoint: OllamaEndpoint): Promise<{
	ok: boolean;
	error?: string;
	modelCount?: number;
}> {
	const url = `http://${endpoint.host}:${endpoint.port}/api/tags`;
	const headers: Record<string, string> = {};

	if (endpoint.auth) {
		if (endpoint.auth.type === 'bearer' && endpoint.auth.token) {
			headers['Authorization'] = `Bearer ${endpoint.auth.token}`;
		} else if (endpoint.auth.type === 'basic' && endpoint.auth.token) {
			headers['Authorization'] = `Basic ${endpoint.auth.token}`;
		}
	}

	try {
		const response = await fetch(url, {
			headers,
			signal: AbortSignal.timeout(5000)
		});
		if (!response.ok) {
			return { ok: false, error: `HTTP ${response.status}` };
		}
		const data = await response.json();
		const modelCount = (data.models || []).length;
		return { ok: true, modelCount };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}

/**
 * List models available on a specific endpoint
 */
export async function listRemoteModels(
	endpoint: OllamaEndpoint
): Promise<string[]> {
	const url = `http://${endpoint.host}:${endpoint.port}/api/tags`;
	const headers: Record<string, string> = {};

	if (endpoint.auth) {
		if (endpoint.auth.type === 'bearer' && endpoint.auth.token) {
			headers['Authorization'] = `Bearer ${endpoint.auth.token}`;
		} else if (endpoint.auth.type === 'basic' && endpoint.auth.token) {
			headers['Authorization'] = `Basic ${endpoint.auth.token}`;
		}
	}

	try {
		const response = await fetch(url, {
			headers,
			signal: AbortSignal.timeout(5000)
		});
		if (!response.ok) return [];
		const data = await response.json();
		return (data.models || []).map((m: any) => m.name);
	} catch {
		return [];
	}
}

/**
 * Pull a model with progress callback
 */
export async function pullModel(
	endpoint: OllamaEndpoint,
	modelName: string,
	onProgress?: (status: string, completed?: number, total?: number) => void
): Promise<boolean> {
	const url = `http://${endpoint.host}:${endpoint.port}/api/pull`;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	if (endpoint.auth) {
		if (endpoint.auth.type === 'bearer' && endpoint.auth.token) {
			headers['Authorization'] = `Bearer ${endpoint.auth.token}`;
		} else if (endpoint.auth.type === 'basic' && endpoint.auth.token) {
			headers['Authorization'] = `Basic ${endpoint.auth.token}`;
		}
	}

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify({ name: modelName, stream: true })
		});

		if (!response.ok) return false;

		const reader = response.body?.getReader();
		if (!reader) return false;

		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const chunk = JSON.parse(line);
					if (onProgress) {
						onProgress(
							chunk.status || 'pulling',
							chunk.completed,
							chunk.total
						);
					}
				} catch {}
			}
		}

		return true;
	} catch {
		return false;
	}
}
