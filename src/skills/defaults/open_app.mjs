export default {
	name: 'open_app',
	description: 'Open applications, URLs, or files on macOS. Can open apps by name, URLs in browser, or files with their default app.',
	inputSchema: {
		target: {
			type: 'string',
			description: 'App name ("Safari"), URL ("https://github.com"), or file path ("/path/to/file.pdf")'
		},
		args: {
			type: 'string',
			description: 'Optional arguments to pass to the app (e.g. a URL to open in a specific browser)'
		}
	},
	requiredParams: ['target'],

	async execute(args) {
		const { execSync } = await import('child_process');
		const target = (args.target || '').trim();
		const extraArgs = args.args || '';

		if (!target) {
			return { success: false, error: 'No target specified. Provide an app name, URL, or file path.' };
		}

		try {
			// URL - open in default browser
			if (target.startsWith('http://') || target.startsWith('https://')) {
				execSync(`open "${target}"`, { timeout: 5000 });
				return { success: true, output: `Opened URL: ${target}` };
			}

			// File path - open with default app
			if (target.startsWith('/') || target.startsWith('~') || target.startsWith('./')) {
				execSync(`open "${target}"`, { timeout: 5000 });
				return { success: true, output: `Opened file: ${target}` };
			}

			// App name with optional args
			if (extraArgs) {
				execSync(`open -a "${target}" "${extraArgs}"`, { timeout: 5000 });
				return { success: true, output: `Opened ${target} with: ${extraArgs}` };
			}

			execSync(`open -a "${target}"`, { timeout: 5000 });
			return { success: true, output: `Opened application: ${target}` };
		} catch (error) {
			return {
				success: false,
				error: `Failed to open "${target}": ${error.message}`
			};
		}
	}
};
