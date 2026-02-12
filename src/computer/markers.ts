// src/computer/markers.ts
import { takeScreenshot } from './screenshot.js';
import { mouseMove } from './mouse.js';

/**
 * Capture a screenshot with the cursor positioned at the specified coordinates.
 * This acts as a 'visual marker' to verify the location of an action.
 */
export async function takeScreenshotWithMarker(
	x: number,
	y: number
): Promise<string> {
	// Move the mouse to the target coordinate
	await mouseMove(x, y);

	// Brief pause to allow OS/GPU to render the cursor position
	await new Promise((resolve) => setTimeout(resolve, 100));

	// Take screenshot with cursor enabled (-C flag)
	return takeScreenshot(true);
}
