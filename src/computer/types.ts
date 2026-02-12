// src/computer/types.ts
/**
 * Computer Use Type Definitions
 *
 * Follows the official Anthropic Computer Use API specification:
 * https://docs.anthropic.com/en/docs/agents-and-tools/computer-use
 */

/**
 * Modifier keys that can be held during click/scroll actions
 * Maps to cliclick modifiers on macOS
 */
export type ModifierKey = 'shift' | 'ctrl' | 'alt' | 'super' | 'command';

/**
 * Scroll directions
 */
export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Computer actions as defined by Anthropic API
 * These match the official schema for computer_20250124 and computer_20251124
 */
export type ComputerAction =
	// Basic actions (all versions)
	| { action: 'screenshot' }
	| { action: 'left_click'; coordinate: [number, number]; text?: string }
	| { action: 'type'; text: string }
	| { action: 'key'; key: string }
	| { action: 'mouse_move'; coordinate: [number, number] }

	// Enhanced actions (computer_20250124+)
	| {
			action: 'scroll';
			coordinate: [number, number];
			scroll_direction: ScrollDirection;
			scroll_amount: number;
			text?: string;
	  }
	| {
			action: 'left_click_drag';
			start_coordinate: [number, number];
			end_coordinate: [number, number];
	  }
	| { action: 'right_click'; coordinate: [number, number]; text?: string }
	| { action: 'middle_click'; coordinate: [number, number]; text?: string }
	| { action: 'double_click'; coordinate: [number, number]; text?: string }
	| { action: 'triple_click'; coordinate: [number, number]; text?: string }
	| { action: 'left_mouse_down'; coordinate: [number, number] }
	| { action: 'left_mouse_up'; coordinate: [number, number] }
	| { action: 'hold_key'; key: string; duration: number }
	| { action: 'wait'; duration: number }

	// Opus 4.5 only (computer_20251124)
	| { action: 'zoom'; region: [number, number, number, number] }

	// Custom extensions
	| { action: 'get_dimensions' }
	| { action: 'batch'; commands: string[] };

/**
 * Display information for coordinate scaling
 */
export interface DisplayInfo {
	width: number;
	height: number;
	scale?: number;
	scaledWidth?: number;
	scaledHeight?: number;
}

/**
 * Computer interface for platform-specific implementations
 */
export interface ComputerInterface {
	/**
	 * Capture full screen screenshot
	 * @param captureCursor - Include cursor in screenshot
	 * @returns Base64 encoded PNG image
	 */
	takeScreenshot(captureCursor?: boolean): Promise<string>;

	/**
	 * Left click at coordinates
	 * @param x - X coordinate
	 * @param y - Y coordinate
	 * @param modifier - Optional modifier key (shift, ctrl, alt, super)
	 */
	leftClick(x: number, y: number, modifier?: string): Promise<void>;

	/**
	 * Type text at current focus
	 * @param text - Text to type
	 */
	typeText(text: string): Promise<void>;

	/**
	 * Press a single key or key combination
	 * @param key - Key name (e.g., 'enter', 'escape', 'ctrl+c')
	 */
	pressKey(key: string): Promise<void>;

	/**
	 * Move mouse to coordinates
	 * @param x - X coordinate
	 * @param y - Y coordinate
	 */
	mouseMove(x: number, y: number): Promise<void>;

	/**
	 * Scroll at coordinates
	 * @param x - X coordinate
	 * @param y - Y coordinate
	 * @param direction - Scroll direction
	 * @param amount - Scroll amount (clicks)
	 * @param modifier - Optional modifier key
	 */
	scroll(
		x: number,
		y: number,
		direction: ScrollDirection,
		amount: number,
		modifier?: string
	): Promise<void>;

	/**
	 * Click and drag from start to end coordinates
	 */
	leftClickDrag(
		startX: number,
		startY: number,
		endX: number,
		endY: number
	): Promise<void>;

	/**
	 * Right click at coordinates
	 */
	rightClick(x: number, y: number, modifier?: string): Promise<void>;

	/**
	 * Middle click at coordinates
	 */
	middleClick(x: number, y: number, modifier?: string): Promise<void>;

	/**
	 * Double click at coordinates
	 */
	doubleClick(x: number, y: number, modifier?: string): Promise<void>;

	/**
	 * Triple click at coordinates (select line/paragraph)
	 */
	tripleClick(x: number, y: number, modifier?: string): Promise<void>;

	/**
	 * Press and hold left mouse button
	 */
	leftMouseDown(x: number, y: number): Promise<void>;

	/**
	 * Release left mouse button
	 */
	leftMouseUp(x: number, y: number): Promise<void>;

	/**
	 * Hold a key for specified duration
	 * @param key - Key to hold
	 * @param duration - Duration in seconds
	 */
	holdKey(key: string, duration: number): Promise<void>;

	/**
	 * Wait/pause for specified duration
	 * @param duration - Duration in milliseconds
	 */
	wait(duration: number): Promise<void>;

	/**
	 * Capture a specific region at full resolution (Opus 4.5 only)
	 * @returns Base64 encoded PNG image of the region
	 */
	zoom(x1: number, y1: number, x2: number, y2: number): Promise<string>;

	/**
	 * Get current display dimensions
	 */
	getDisplayDimensions(): Promise<DisplayInfo>;

	/**
	 * Execute multiple cliclick commands in batch
	 * @param commands - Array of cliclick command strings
	 */
	executeBatch(commands: string[]): Promise<void>;
}
