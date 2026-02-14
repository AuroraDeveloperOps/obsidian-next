export default {
	name: 'clipboard',
	description: 'Read from or write to the system clipboard. Useful for sharing data between the agent and other apps.',
	inputSchema: {
		action: {
			type: 'string',
			description: 'Action: read (get clipboard contents) or write (set clipboard contents)'
		},
		content: {
			type: 'string',
			description: 'Content to write to clipboard (required for write action)'
		}
	},
	requiredParams: ['action'],

	async execute(args) {
		const { execSync } = await import('child_process');
		const action = (args.action || '').toLowerCase().trim();

		try {
			if (action === 'read') {
				const content = execSync('pbpaste', { encoding: 'utf-8', timeout: 5000 });
				if (!content.trim()) {
					return { success: true, output: '[Clipboard is empty]' };
				}
				const truncated = content.length > 5000
					? content.slice(0, 5000) + `\n... [truncated ${content.length - 5000} chars]`
					: content;
				return { success: true, output: `Clipboard contents:\n${truncated}` };
			}

			if (action === 'write') {
				const content = args.content || '';
				if (!content) {
					return { success: false, error: 'No content provided for write action' };
				}
				execSync(`echo -n ${JSON.stringify(content)} | pbcopy`, { timeout: 5000 });
				return { success: true, output: `Copied ${content.length} chars to clipboard` };
			}

			return { success: false, error: `Unknown action: ${action}. Use "read" or "write".` };
		} catch (error) {
			return { success: false, error: `Clipboard error: ${error.message}` };
		}
	}
};
