// src/computer/mouse.ts
import { shell } from './shell.js';

// Note: cliclick needs to be installed. `brew install cliclick`

function getModifier(modifier?: string): string {
	if (!modifier) return '';
	switch (modifier.toLowerCase()) {
		case 'shift':
			return 'shift-';
		case 'ctrl':
			return 'ctrl-';
		case 'alt':
			return 'alt-';
		case 'super':
			return 'cmd-'; // 'super' usually maps to 'cmd' on macOS
		default:
			return '';
	}
}

export async function leftClick(
	x: number,
	y: number,
	modifier?: string
): Promise<void> {
	const mod = getModifier(modifier);
	await shell.execute(`cliclick ${mod}c:${x},${y}`);
}

export async function mouseMove(x: number, y: number): Promise<void> {
	await shell.execute(`cliclick m:${x},${y}`);
}

export async function leftClickDrag(
	startX: number,
	startY: number,
	endX: number,
	endY: number
): Promise<void> {
	// dd: = drag down (mouse down), du: = drag up (mouse up)
	await shell.execute(`cliclick dd:${startX},${startY} du:${endX},${endY}`);
}

export async function rightClick(
	x: number,
	y: number,
	modifier?: string
): Promise<void> {
	const mod = getModifier(modifier);
	await shell.execute(`cliclick ${mod}rc:${x},${y}`);
}

export async function middleClick(
	x: number,
	y: number,
	modifier?: string
): Promise<void> {
	// cliclick doesn't directly support middle click, so we'll simulate it with a more complex command if needed, or simply not implement for now.
	// For now, let's just log a warning or throw an error.
	console.warn(
		'Middle click not directly supported by cliclick. Consider alternative implementation if needed.'
	);
	await shell.execute(
		`echo "Middle click at ${x},${y} with modifier ${modifier} requested but not fully supported by cliclick."`
	);
}

export async function doubleClick(
	x: number,
	y: number,
	modifier?: string
): Promise<void> {
	const mod = getModifier(modifier);
	await shell.execute(`cliclick ${mod}dc:${x},${y}`);
}

export async function tripleClick(
	x: number,
	y: number,
	modifier?: string
): Promise<void> {
	const mod = getModifier(modifier);
	await shell.execute(`cliclick ${mod}tc:${x},${y}`);
}

export async function leftMouseDown(x: number, y: number): Promise<void> {
	// dd: = drag down (press and hold mouse button at position)
	await shell.execute(`cliclick dd:${x},${y}`);
}

export async function leftMouseUp(x: number, y: number): Promise<void> {
	// du: = drag up (release mouse button at position)
	await shell.execute(`cliclick du:${x},${y}`);
}

// Scroll functionality might be tricky with cliclick, as it primarily focuses on clicks and key presses.
// For now, a basic implementation that might not be fully featured.
export async function scroll(
	x: number,
	y: number,
	direction: 'up' | 'down' | 'left' | 'right',
	amount: number,
	modifier?: string
): Promise<void> {
	let scrollCommand = '';
	const mod = getModifier(modifier);

	// cliclick supports scroll actions, but direction and amount might need mapping
	// Assuming 'm' for mouse move before scroll to ensure context
	await shell.execute(`cliclick m:${x},${y}`);

	// cliclick scroll command is `sc:<direction><amount>`
	// Direction can be u, d, l, r. Amount is number of "clicks".
	switch (direction) {
		case 'up':
			scrollCommand = `${mod}sc:u${amount}`;
			break;
		case 'down':
			scrollCommand = `${mod}sc:d${amount}`;
			break;
		case 'left':
			scrollCommand = `${mod}sc:l${amount}`;
			break;
		case 'right':
			scrollCommand = `${mod}sc:r${amount}`;
			break;
		default:
			console.warn(`Unsupported scroll direction: ${direction}`);
			return;
	}

	await shell.execute(`cliclick ${scrollCommand}`);
}

export async function executeBatch(commands: string[]): Promise<void> {
	const batchString = commands.join(' ');
	await shell.execute(`cliclick ${batchString}`);
}
