// src/computer/keyboard.ts
/**
 * Keyboard operations using cliclick on macOS
 *
 * Supports:
 * - Text typing with special character escaping
 * - Single key presses
 * - Key combinations (e.g., 'ctrl+c', 'cmd+shift+s')
 * - Key hold for duration
 *
 * Install: brew install cliclick
 */
import { shell } from './shell.js';

// Key name mappings for cliclick compatibility
const KEY_MAP: Record<string, string> = {
	enter: 'return',
	return: 'return',
	'\n': 'return',
	'\r': 'return',
	'num-enter': 'num-enter',
	escape: 'esc',
	esc: 'esc',
	tab: 'tab',
	backspace: 'delete', // macOS backspace
	delete: 'fwd-delete', // macOS forward delete
	space: 'space',
	up: 'arrow-up',
	down: 'arrow-down',
	left: 'arrow-left',
	right: 'arrow-right',
	home: 'home',
	end: 'end',
	pageup: 'page-up',
	pagedown: 'page-down',
	f1: 'f1',
	f2: 'f2',
	f3: 'f3',
	f4: 'f4',
	f5: 'f5',
	f6: 'f6',
	f7: 'f7',
	f8: 'f8',
	f9: 'f9',
	f10: 'f10',
	f11: 'f11',
	f12: 'f12'
};

// Modifier key mappings
const MODIFIER_MAP: Record<string, string> = {
	ctrl: 'ctrl',
	control: 'ctrl',
	alt: 'alt',
	option: 'alt',
	shift: 'shift',
	cmd: 'cmd',
	command: 'cmd',
	super: 'cmd',
	meta: 'cmd',
	win: 'cmd'
};

/**
 * Type text at current focus point
 * Handles special character escaping for cliclick
 */
export async function typeText(text: string): Promise<void> {
	if (!text) return;

	// Split by newlines and type each segment with 'return' in between
	// cliclick t:"text" doesn't support raw newlines
	const segments = text.split(/\r?\n/);

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];
		if (segment) {
			// Escape special characters for cliclick 't:' command
			const escapedText = segment
				.replace(/\\/g, '\\\\')
				.replace(/"/g, '\\"')
				.replace(/'/g, "\\'");

			await shell.execute(`cliclick t:"${escapedText}"`);
		}

		// If not the last segment, press return
		if (i < segments.length - 1) {
			await shell.execute('cliclick kp:return');
		}
	}
}

/**
 * Press a key or key combination
 *
 * Supports:
 * - Single keys: 'enter', 'escape', 'a', '1'
 * - Combinations: 'ctrl+c', 'cmd+shift+s', 'alt+f4'
 *
 * @param key - Key name or combination (e.g., 'enter', 'ctrl+c')
 */
export async function pressKey(key: string): Promise<void> {
	if (!key) {
		throw new Error('Key is required for pressKey action');
	}

	const keyLower = key.toLowerCase();

	// Check for key combinations (e.g., 'ctrl+c', 'cmd+shift+s')
	if (keyLower.includes('+')) {
		await pressKeyCombination(keyLower);
		return;
	}

	// Single key press
	const mappedKey = KEY_MAP[keyLower];

	if (mappedKey) {
		// Special keys use kp:
		await shell.execute(`cliclick kp:${mappedKey}`);
		return;
	}

	// Check if it's a modifier key by itself
	if (MODIFIER_MAP[keyLower]) {
		// Just tap the modifier key
		const mod = MODIFIER_MAP[keyLower];
		await shell.execute(`cliclick kd:${mod} ku:${mod}`);
		return;
	}

	// Regular single character, use t: (type)
	// Must escape it just in case
	const escapedKey = key
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/'/g, "\\'");
	await shell.execute(`cliclick t:"${escapedKey}"`);
}

/**
 * Press a key combination like 'ctrl+c' or 'cmd+shift+s'
 *
 * cliclick requires: kd:modifier kp:key ku:modifier
 * For multiple modifiers: kd:cmd kd:shift kp:s ku:shift ku:cmd
 *
 * IMPORTANT: kp: only works for special keys (return, esc, arrows, f-keys, etc.)
 * For regular ASCII letters/numbers, we must use t: (type) instead
 */
async function pressKeyCombination(combo: string): Promise<void> {
	const parts = combo.split('+').map((p) => p.trim());
	const mainKey = parts.pop()!;
	const mainKeyLower = mainKey.toLowerCase();
	const modifiers = parts
		.map((m) => MODIFIER_MAP[m.toLowerCase()] || m.toLowerCase())
		.filter((m) => m);

	const mappedKey = KEY_MAP[mainKeyLower];

	// Build command: hold all modifiers, press/type key, release all modifiers (reverse order)
	const holdCmds = modifiers.map((m) => `kd:${m}`).join(' ');
	const releaseCmds = modifiers
		.reverse()
		.map((m) => `ku:${m}`)
		.join(' ');

	if (mappedKey) {
		// Special keys use kp:
		await shell.execute(`cliclick ${holdCmds} kp:${mappedKey} ${releaseCmds}`);
	} else {
		// Regular letters/numbers use t: (type)
		// Escape the main key
		const escapedKey = mainKey
			.replace(/\\/g, '\\\\')
			.replace(/"/g, '\\"')
			.replace(/'/g, "\\'");
		await shell.execute(
			`cliclick ${holdCmds} t:"${escapedKey}" ${releaseCmds}`
		);
	}
}

/**
 * Hold a key for a specified duration
 *
 * @param key - Key to hold (typically a modifier)
 * @param duration - Duration in seconds
 */
export async function holdKey(key: string, duration: number): Promise<void> {
	if (!key) {
		throw new Error('Key is required for holdKey action');
	}

	const keyLower = key.toLowerCase();
	const cliclickKey = MODIFIER_MAP[keyLower] || KEY_MAP[keyLower] || keyLower;

	// Use a single command chain for atomicity
	const durationSec = Math.max(0.1, duration);
	await shell.execute(
		`cliclick kd:${cliclickKey} w:${Math.round(durationSec * 1000)} ku:${cliclickKey}`
	);
}
