/**
 * Setup Helpers - Utilities for the onboarding wizard
 */

/**
 * Detect if Ollama is running locally
 */
export async function detectOllama(
	host: string = 'localhost',
	port: number = 11434
): Promise<{ available: boolean; models: string[]; error?: string }> {
	try {
		const response = await fetch(`http://${host}:${port}/api/tags`, {
			signal: AbortSignal.timeout(3000)
		});
		if (!response.ok) {
			return { available: false, models: [], error: `HTTP ${response.status}` };
		}
		const data = await response.json();
		const models = (data.models || []).map((m: any) => m.name);
		return { available: true, models };
	} catch (err) {
		return {
			available: false,
			models: [],
			error: err instanceof Error ? err.message : String(err)
		};
	}
}

/**
 * Validate an Anthropic API key format
 */
export function validateKeyFormat(key: string): boolean {
	// Anthropic keys start with sk-ant- and are roughly 90+ chars
	if (!key.startsWith('sk-ant-')) return false;
	if (key.length < 40) return false;
	return true;
}

/**
 * Test a Claude API key with a minimal request
 */
export async function testClaudeKey(
	key: string
): Promise<{ valid: boolean; error?: string }> {
	try {
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': key,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 1,
				messages: [{ role: 'user', content: 'hi' }]
			}),
			signal: AbortSignal.timeout(10000)
		});

		if (response.ok) {
			return { valid: true };
		}

		const data = await response.json().catch(() => ({}));
		if (response.status === 401) {
			return { valid: false, error: 'Invalid API key' };
		}
		// 429 (rate limit) or other errors still mean the key is valid
		if (response.status === 429 || response.status === 529) {
			return { valid: true };
		}
		return { valid: false, error: data.error?.message || `HTTP ${response.status}` };
	} catch (err) {
		return {
			valid: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}

/**
 * Pull an Ollama model with progress callback
 */
export async function pullOllamaModel(
	host: string,
	port: number,
	modelName: string,
	onProgress?: (pct: number, status: string) => void
): Promise<{ success: boolean; error?: string }> {
	try {
		const response = await fetch(`http://${host}:${port}/api/pull`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: modelName, stream: true })
		});

		if (!response.ok) {
			return { success: false, error: `HTTP ${response.status}` };
		}

		const reader = response.body?.getReader();
		if (!reader) return { success: false, error: 'No response body' };

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
					if (onProgress && chunk.total) {
						const pct = Math.round(((chunk.completed || 0) / chunk.total) * 100);
						onProgress(pct, chunk.status || 'pulling');
					} else if (onProgress) {
						onProgress(0, chunk.status || 'pulling');
					}
				} catch {}
			}
		}

		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
