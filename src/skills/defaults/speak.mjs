export default {
	name: 'speak',
	description: 'Speak text aloud using macOS text-to-speech (say command). Useful for notifications, alerts, or reading content to the user.',
	inputSchema: {
		text: {
			type: 'string',
			description: 'Text to speak aloud'
		},
		voice: {
			type: 'string',
			description: 'Voice name (default: system default). Options: Alex, Samantha, Daniel, Karen, Moira, Tessa, Veena'
		},
		rate: {
			type: 'number',
			description: 'Speech rate in words per minute (default: 200, range: 100-400)'
		}
	},
	requiredParams: ['text'],

	async execute(args) {
		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		const text = (args.text || '').replace(/'/g, "'\\''"); // Escape single quotes
		const voice = args.voice || '';
		const rate = Math.max(100, Math.min(400, parseInt(args.rate) || 200));

		if (!text.trim()) {
			return { success: false, error: 'No text provided to speak' };
		}

		try {
			let cmd = `say -r ${rate}`;
			if (voice) cmd += ` -v "${voice}"`;
			cmd += ` '${text}'`;

			await execAsync(cmd, { timeout: 30000 });
			return { success: true, output: `Spoke: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"` };
		} catch (error) {
			return {
				success: false,
				error: `Speech failed: ${error.message}`
			};
		}
	}
};
