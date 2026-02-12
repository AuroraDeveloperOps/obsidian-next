/**
 * HTTP Request Tool - Full HTTP method support for APIs
 */

import { Tool, ToolResult, truncateOutput } from '../shared.js';

export const HttpRequestTool: Tool = {
	name: 'http_request',
	description:
		'Make HTTP requests with any method (GET, POST, PUT, PATCH, DELETE). Use this for API calls, webhooks, and HTTP interactions beyond simple page fetching.',
	inputSchema: {
		method: {
			type: 'string',
			description: 'HTTP method: GET, POST, PUT, PATCH, DELETE'
		},
		url: {
			type: 'string',
			description: 'Full URL to request'
		},
		headers: {
			type: 'string',
			description:
				'JSON string of headers (e.g., {"Authorization": "Bearer ...","Content-Type": "application/json"})'
		},
		body: {
			type: 'string',
			description:
				'Request body (string or JSON string). Sent as-is for POST/PUT/PATCH.'
		}
	},
	requiredParams: ['method', 'url'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const method = ((args.method as string) || 'GET').toUpperCase();
		const url = args.url as string;
		const headersStr = args.headers as string;
		const body = args.body as string;

		if (!url) {
			return { success: false, error: 'URL is required' };
		}

		const validMethods = [
			'GET',
			'POST',
			'PUT',
			'PATCH',
			'DELETE',
			'HEAD',
			'OPTIONS'
		];
		if (!validMethods.includes(method)) {
			return {
				success: false,
				error: `Invalid method: ${method}. Use: ${validMethods.join(', ')}`
			};
		}

		// Validate URL
		let urlObj: URL;
		try {
			urlObj = new URL(url);
		} catch {
			return { success: false, error: 'Invalid URL format' };
		}

		// Block local/private addresses
		const blockedDomains = [
			'localhost',
			'127.0.0.1',
			'0.0.0.0',
			'169.254',
			'10.',
			'192.168.',
			'172.16.'
		];
		if (
			blockedDomains.some(
				(d) => urlObj.hostname.includes(d) || urlObj.hostname.startsWith(d)
			)
		) {
			return {
				success: false,
				error: 'Cannot make requests to local/private addresses'
			};
		}

		// Parse headers
		let headers: Record<string, string> = {
			'User-Agent': 'Obsidian-Next/1.0 (AI Agent CLI)'
		};
		if (headersStr) {
			try {
				const parsed = JSON.parse(headersStr);
				headers = { ...headers, ...parsed };
			} catch {
				return { success: false, error: 'Invalid headers JSON' };
			}
		}

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 15000);

			const fetchOpts: RequestInit = {
				method,
				headers,
				signal: controller.signal
			};

			if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
				fetchOpts.body = body;
				// Auto-set content-type if not specified
				if (!headers['Content-Type'] && !headers['content-type']) {
					try {
						JSON.parse(body);
						(fetchOpts.headers as Record<string, string>)['Content-Type'] =
							'application/json';
					} catch {
						// Leave as-is
					}
				}
			}

			const response = await fetch(url, fetchOpts);
			clearTimeout(timeoutId);

			const contentType = response.headers.get('content-type') || '';
			let content = await response.text();

			// Build response summary
			const statusLine = `${response.status} ${response.statusText}`;
			const respHeaders: Record<string, string> = {};
			response.headers.forEach((value, key) => {
				respHeaders[key] = value;
			});
			const headerSummary = Object.entries(respHeaders)
				.slice(0, 10)
				.map(([k, v]) => `  ${k}: ${v}`)
				.join('\n');

			const output = [
				`${method} ${url} -> ${statusLine}`,
				`Response Headers:\n${headerSummary}`,
				`${'='.repeat(60)}`,
				content
			].join('\n');

			return {
				success: response.ok,
				output: truncateOutput(output),
				error: response.ok ? undefined : `HTTP ${statusLine}`
			};
		} catch (error: unknown) {
			if (error instanceof Error && error.name === 'AbortError') {
				return { success: false, error: 'Request timed out after 15 seconds' };
			}
			return {
				success: false,
				error: `Request failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
};
