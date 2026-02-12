/**
 * Web Fetch Tool - Fetch content from URLs via GET
 */

import {
	Tool,
	ToolResult,
	truncateOutput,
	MAX_OUTPUT_LENGTH
} from '../shared.js';

export const WebFetchTool: Tool = {
	name: 'web_fetch',
	description:
		'Fetch content from a URL via GET request (for documentation, web pages, etc.). GET-only -- use http_request for POST/PUT/PATCH/DELETE.',
	inputSchema: {
		url: {
			type: 'string',
			description: 'URL to fetch content from'
		}
	},
	requiredParams: ['url'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const url = args.url as string;

		if (!url) {
			return { success: false, error: 'No URL provided' };
		}

		// Validate URL
		try {
			new URL(url);
		} catch {
			return { success: false, error: 'Invalid URL format' };
		}

		// Block potentially dangerous URLs
		const blockedDomains = ['localhost', '127.0.0.1', '0.0.0.0', '169.254'];
		const urlObj = new URL(url);
		if (blockedDomains.some((d) => urlObj.hostname.includes(d))) {
			return {
				success: false,
				error: 'Cannot fetch from local/private addresses'
			};
		}

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

			const response = await fetch(url, {
				signal: controller.signal,
				headers: {
					'User-Agent': 'Obsidian-Next/1.0 (AI Agent CLI)',
					Accept: 'text/html,application/json,text/plain,*/*'
				}
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				return {
					success: false,
					error: `HTTP ${response.status}: ${response.statusText}`
				};
			}

			const contentType = response.headers.get('content-type') || '';
			let content = await response.text();

			// Truncate large responses
			if (content.length > MAX_OUTPUT_LENGTH) {
				content =
					content.slice(0, MAX_OUTPUT_LENGTH) +
					`\n\n... [TRUNCATED: ${content.length - MAX_OUTPUT_LENGTH} more characters]`;
			}

			// If HTML, strip tags for cleaner output
			if (contentType.includes('text/html')) {
				content = content
					.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
					.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
					.replace(/<[^>]+>/g, ' ')
					.replace(/\s+/g, ' ')
					.trim();
			}

			return {
				success: true,
				output: truncateOutput(
					`URL: ${url}\nContent-Type: ${contentType}\n${'='.repeat(60)}\n${content}`
				)
			};
		} catch (error: unknown) {
			if (error instanceof Error && error.name === 'AbortError') {
				return { success: false, error: 'Request timed out after 10 seconds' };
			}
			return {
				success: false,
				error: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
};
