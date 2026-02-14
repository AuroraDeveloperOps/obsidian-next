export default {
	name: 'system_notify',
	description: 'Send a macOS notification to the user. Useful for alerting when long tasks complete or important events occur.',
	inputSchema: {
		title: {
			type: 'string',
			description: 'Notification title'
		},
		message: {
			type: 'string',
			description: 'Notification body text'
		},
		sound: {
			type: 'string',
			description: 'Sound name (default: "default"). Options: Basso, Blow, Bottle, Frog, Funk, Glass, Hero, Morse, Ping, Pop, Purr, Sosumi, Submarine, Tink'
		}
	},
	requiredParams: ['title', 'message'],

	async execute(args) {
		const { execSync } = await import('child_process');
		const title = (args.title || 'Obsidian').replace(/"/g, '\\"');
		const message = (args.message || '').replace(/"/g, '\\"');
		const sound = args.sound || 'default';

		try {
			execSync(
				`osascript -e 'display notification "${message}" with title "${title}" sound name "${sound}"'`,
				{ timeout: 5000 }
			);
			return { success: true, output: `Notification sent: ${title} - ${message}` };
		} catch (error) {
			return { success: false, error: `Notification failed: ${error.message}` };
		}
	}
};
