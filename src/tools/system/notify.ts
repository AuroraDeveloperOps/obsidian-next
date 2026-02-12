/**
 * Notify Tool - Send immediate notifications
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolResult } from '../shared.js';

const execAsync = promisify(exec);

export const NotifyTool: Tool = {
	name: 'notify',
	description:
		'Send an immediate notification (sound alert, native OS notification, optional voice). Use this for direct alerts without scheduling.',
	inputSchema: {
		title: {
			type: 'string',
			description: 'Notification title (default: "Obsidian")'
		},
		message: {
			type: 'string',
			description: 'Notification message text'
		},
		sound: {
			type: 'string',
			description:
				'macOS sound name (default: "Glass"). Options: Glass, Basso, Blow, Bottle, Frog, Funk, Hero, Morse, Ping, Pop, Purr, Sosumi, Submarine, Tink'
		},
		speak: {
			type: 'boolean',
			description:
				'Whether to speak the message aloud via TTS (default: true on macOS)'
		}
	},
	requiredParams: ['message'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const title = (args.title as string) || 'Obsidian';
		const message = args.message as string;
		const sound = (args.sound as string) || 'Glass';
		const speak = args.speak !== false;

		if (!message) {
			return { success: false, error: 'Message is required' };
		}

		try {
			if (process.platform === 'darwin') {
				// Terminal bell
				process.stdout.write('\x07');

				// Sound
				await execAsync(`afplay /System/Library/Sounds/${sound}.aiff`).catch(
					() => {}
				);

				// Native notification
				const escapedMessage = message.replace(/"/g, '\\"');
				const escapedTitle = title.replace(/"/g, '\\"');
				await execAsync(
					`osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}" sound name "${sound}"'`
				).catch(() => {});

				// Voice
				if (speak) {
					const safeMsg = message.replace(/["'$`\\]/g, '');
					await execAsync(`say -v Daniel "${safeMsg}"`).catch(() => {});
				}
			} else if (process.platform === 'linux') {
				await execAsync(`notify-send "${title}" "${message}"`).catch(() => {});
			}

			return {
				success: true,
				output: `Notification sent: "${title}: ${message}" (sound: ${sound}, voice: ${speak ? 'on' : 'off'})`
			};
		} catch (error: unknown) {
			return {
				success: false,
				error: `Notification failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
};
