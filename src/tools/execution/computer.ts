/**
 * Computer Use Tool - Desktop interaction with accessibility support
 */

import { bus } from '../../core/bus.js';
import { computer, takeScreenshotForAPI } from '../../computer/index.js';
import {
	findClickableByLabel,
	clickElementByLabel,
	getUIContext,
	getButtons,
	activateApp,
	getFocusedApp
} from '../../computer/accessibility.js';
import {
	Tool,
	ToolResult,
	lastScreenshotScale,
	setLastScreenshotScale
} from '../shared.js';

export const ComputerUseTool: Tool = {
	name: 'computer',
	description: `Desktop interaction. PREFER BASH for URLs/apps (e.g., bash 'open "https://youtube.com"').

SMART ACTIONS (use first):
- find_and_click: Click by label ("Submit", "Play") - no coordinates needed
- get_ui_context: List buttons/fields in current window
- get_buttons: List all button labels
- activate_app: Bring app to front

COORDINATE ACTIONS (use when smart actions fail):
- screenshot: Capture screen
- left_click: Click at [x,y]
- type: Type text
- key: Press key (cmd+l, Return, etc.)
- scroll: Scroll at position`,
	inputSchema: {
		action: {
			type: 'string',
			description:
				'SMART (prefer): find_and_click, get_ui_context, get_buttons, activate_app, get_focused_app. COORDINATE (fallback): screenshot, left_click, type, key, scroll, mouse_move, double_click, right_click, left_click_drag, wait, zoom.'
		},
		coordinate: {
			type: 'array',
			items: { type: 'number' },
			description: '[x, y] pixel coordinates for coordinate-based actions.'
		},
		text: {
			type: 'string',
			description:
				'Text to type, or modifier key for clicks (shift, control, alt, command).'
		},
		key: {
			type: 'string',
			description: 'Key to press (e.g., enter, escape, ctrl+c).'
		},
		label: {
			type: 'string',
			description:
				'UI element label for find_and_click (e.g., "Submit", "Cancel", "OK").'
		},
		app_name: {
			type: 'string',
			description:
				'Application name for activate_app or to scope element search.'
		},
		scroll_direction: {
			type: 'string',
			description: 'up, down, left, or right'
		},
		scroll_amount: {
			type: 'number',
			description: 'Amount to scroll (default: 3)'
		},
		start_coordinate: {
			type: 'array',
			items: { type: 'number' },
			description: '[x, y] start coordinates for drag'
		},
		end_coordinate: {
			type: 'array',
			items: { type: 'number' },
			description: '[x, y] end coordinates for drag'
		},
		duration: {
			type: 'number',
			description: 'Duration in milliseconds (for wait, hold_key)'
		},
		region: {
			type: 'array',
			items: { type: 'number' },
			description: '[x1, y1, x2, y2] region for zoom'
		}
	},
	requiredParams: ['action'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const actionType = args.action;

		if (!actionType) {
			return {
				success: false,
				error:
					'No computer action provided. Use: screenshot, left_click, type, key, mouse_move, scroll, etc.'
			};
		}

		// Helper to validate coordinate array
		const validateCoord = (
			coord: unknown,
			name: string = 'coordinate'
		): [number, number] | null => {
			if (!coord || !Array.isArray(coord) || coord.length < 2) {
				return null;
			}
			const x = Number(coord[0]);
			const y = Number(coord[1]);
			if (isNaN(x) || isNaN(y)) return null;
			return [x, y];
		};

		// Scale coordinates from screenshot space to native screen space
		// This ensures clicks land in the correct position regardless of pilot mode
		const scaleToNative = (coord: [number, number]): [number, number] => {
			if (lastScreenshotScale >= 1.0) return coord;
			return [
				Math.round(coord[0] / lastScreenshotScale),
				Math.round(coord[1] / lastScreenshotScale)
			];
		};

		try {
			let output: string | undefined;

			switch (actionType) {
				case 'screenshot':
					// Use API-optimized screenshot (resized for API limits)
					const screenshotResult = await takeScreenshotForAPI(false);
					// Store scale for coordinate transformation (works with or without pilot mode)
					setLastScreenshotScale(screenshotResult.scale);
					// Emit scale update so coordinate conversion uses the correct values
					bus.emitAgent({
						type: 'computer_scale_update',
						scale: screenshotResult.scale,
						scaledWidth: screenshotResult.width,
						scaledHeight: screenshotResult.height,
						nativeWidth: Math.round(
							screenshotResult.width / screenshotResult.scale
						),
						nativeHeight: Math.round(
							screenshotResult.height / screenshotResult.scale
						)
					});
					return {
						success: true,
						output: `Screenshot captured (${screenshotResult.width}x${screenshotResult.height}, scale: ${screenshotResult.scale.toFixed(2)}). Native: ${Math.round(screenshotResult.width / screenshotResult.scale)}x${Math.round(screenshotResult.height / screenshotResult.scale)}`,
						content: [
							{
								type: 'image',
								data: screenshotResult.base64,
								mimeType: 'image/png'
							}
						]
					};

				case 'left_click': {
					const coord = validateCoord(args.coordinate);
					if (!coord)
						return {
							success: false,
							error: 'left_click requires coordinate: [x, y] as numbers'
						};
					const [nativeX, nativeY] = scaleToNative(coord);
					await computer.leftClick(
						nativeX,
						nativeY,
						args.text as string | undefined
					);
					output = `Clicked at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}). If this missed the target, re-examine the screenshot and identify the EXACT center of the element you want to click.`;
					break;
				}

				case 'type': {
					const text = args.text as string | undefined;
					if (!text && text !== '')
						return { success: false, error: 'type requires text parameter' };
					await computer.typeText(text);
					output = `Typed: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`;
					break;
				}
				case 'key': {
					const keyToPress = (args.key || args.text) as string | undefined;
					if (!keyToPress)
						return {
							success: false,
							error:
								'key requires key parameter (e.g., "enter", "escape", "ctrl+c")'
						};
					await computer.pressKey(keyToPress);
					output = `Pressed key: ${keyToPress}`;
					break;
				}

				case 'mouse_move': {
					const coord = validateCoord(args.coordinate);
					if (!coord)
						return {
							success: false,
							error: 'mouse_move requires coordinate: [x, y]'
						};
					const [nativeX, nativeY] = scaleToNative(coord);
					await computer.mouseMove(nativeX, nativeY);
					output = `Mouse moved to screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
					break;
				}

				case 'scroll': {
					const coord = validateCoord(args.coordinate);
					if (!coord)
						return {
							success: false,
							error: 'scroll requires coordinate: [x, y]'
						};
					const scrollDir = args.scroll_direction as string | undefined;
					if (!scrollDir)
						return {
							success: false,
							error: 'scroll requires scroll_direction: up|down|left|right'
						};
					const amount = (args.scroll_amount as number) || 3;
					const [nativeX, nativeY] = scaleToNative(coord);
					await computer.scroll(
						nativeX,
						nativeY,
						scrollDir as import('../../computer/types.js').ScrollDirection,
						amount,
						args.text as string | undefined
					);
					output = `Scrolled ${scrollDir} by ${amount} at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
					break;
				}

				case 'left_click_drag': {
					const startCoord = validateCoord(
						args.start_coordinate,
						'start_coordinate'
					);
					const endCoord = validateCoord(args.end_coordinate, 'end_coordinate');
					if (!startCoord)
						return {
							success: false,
							error: 'left_click_drag requires start_coordinate: [x, y]'
						};
					if (!endCoord)
						return {
							success: false,
							error: 'left_click_drag requires end_coordinate: [x, y]'
						};
					const [nativeStartX, nativeStartY] = scaleToNative(startCoord);
					const [nativeEndX, nativeEndY] = scaleToNative(endCoord);
					await computer.leftClickDrag(
						nativeStartX,
						nativeStartY,
						nativeEndX,
						nativeEndY
					);
					output = `Dragged from screenshot (${startCoord[0]}, ${startCoord[1]}) -> native (${nativeStartX}, ${nativeStartY}) to screenshot (${endCoord[0]}, ${endCoord[1]}) -> native (${nativeEndX}, ${nativeEndY}).`;
					break;
				}

				case 'right_click': {
					const coord = validateCoord(args.coordinate);
					if (!coord)
						return {
							success: false,
							error: 'right_click requires coordinate: [x, y]'
						};
					const [nativeX, nativeY] = scaleToNative(coord);
					await computer.rightClick(
						nativeX,
						nativeY,
						args.text as string | undefined
					);
					output = `Right click at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
					break;
				}

				case 'middle_click': {
					const coord = validateCoord(args.coordinate);
					if (!coord)
						return {
							success: false,
							error: 'middle_click requires coordinate: [x, y]'
						};
					const [nativeX, nativeY] = scaleToNative(coord);
					await computer.middleClick(
						nativeX,
						nativeY,
						args.text as string | undefined
					);
					output = `Middle click at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
					break;
				}

				case 'double_click': {
					const coord = validateCoord(args.coordinate);
					if (!coord)
						return {
							success: false,
							error: 'double_click requires coordinate: [x, y]'
						};
					const [nativeX, nativeY] = scaleToNative(coord);
					await computer.doubleClick(
						nativeX,
						nativeY,
						args.text as string | undefined
					);
					output = `Double click at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
					break;
				}

				case 'triple_click': {
					const coord = validateCoord(args.coordinate);
					if (!coord)
						return {
							success: false,
							error: 'triple_click requires coordinate: [x, y]'
						};
					const [nativeX, nativeY] = scaleToNative(coord);
					await computer.tripleClick(
						nativeX,
						nativeY,
						args.text as string | undefined
					);
					output = `Triple click at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
					break;
				}

				case 'left_mouse_down': {
					const coord = validateCoord(args.coordinate);
					if (!coord)
						return {
							success: false,
							error: 'left_mouse_down requires coordinate: [x, y]'
						};
					const [nativeX, nativeY] = scaleToNative(coord);
					await computer.leftMouseDown(nativeX, nativeY);
					output = `Mouse down at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
					break;
				}

				case 'left_mouse_up': {
					const coord = validateCoord(args.coordinate);
					if (!coord)
						return {
							success: false,
							error: 'left_mouse_up requires coordinate: [x, y]'
						};
					const [nativeX, nativeY] = scaleToNative(coord);
					await computer.leftMouseUp(nativeX, nativeY);
					output = `Mouse up at screenshot (${coord[0]}, ${coord[1]}) -> native (${nativeX}, ${nativeY}).`;
					break;
				}

				case 'hold_key': {
					const keyToHold = (args.key || args.text) as string | undefined;
					if (!keyToHold)
						return { success: false, error: 'hold_key requires key parameter' };
					const duration = (args.duration as number) || 1;
					await computer.holdKey(keyToHold, duration);
					output = `Held ${keyToHold} for ${duration}s.`;
					break;
				}

				case 'wait': {
					const duration = (args.duration as number) || 1000;
					await computer.wait(duration);
					output = `Waited ${duration}ms.`;
					break;
				}

				case 'zoom': {
					const regionVal = args.region as unknown;
					if (!regionVal || !Array.isArray(regionVal) || regionVal.length < 4) {
						return {
							success: false,
							error: 'zoom requires region: [x1, y1, x2, y2]'
						};
					}
					const [x1, y1, x2, y2] = regionVal as number[];
					const [nativeX1, nativeY1] = scaleToNative([x1, y1]);
					const [nativeX2, nativeY2] = scaleToNative([x2, y2]);
					const zoomResult = await computer.zoom(
						nativeX1,
						nativeY1,
						nativeX2,
						nativeY2
					);
					return {
						success: true,
						output: `Zoomed region screenshot (${x1}, ${y1}) to (${x2}, ${y2}) -> native (${nativeX1}, ${nativeY1}) to (${nativeX2}, ${nativeY2}).`,
						content: [
							{ type: 'image', data: zoomResult, mimeType: 'image/png' }
						]
					};
				}

				case 'get_dimensions':
					const dims = await computer.getDisplayDimensions();
					return {
						success: true,
						output: `Display: ${dims.width}x${dims.height}. Use these dimensions for coordinate calculations.`
					};

				case 'batch': {
					const cmds = args.commands as unknown;
					if (!cmds || !Array.isArray(cmds)) {
						return {
							success: false,
							error: 'batch requires commands: string[]'
						};
					}
					await computer.executeBatch(cmds as string[]);
					output = `Batch executed ${cmds.length} commands.`;
					break;
				}
				// ==================== SMART ACCESSIBILITY-BASED ACTIONS ====================

				case 'find_and_click': {
					// Click an element by its label using accessibility API
					if (!args.label)
						return {
							success: false,
							error:
								'find_and_click requires label parameter (e.g., "Submit", "OK")'
						};
					const label = args.label as string;

					// First try accessibility-based click (more reliable)
					const clicked = await clickElementByLabel(
						label,
						args.app_name as string | undefined
					);
					if (clicked) {
						output = `Clicked element labeled "${label}" via accessibility API.`;
						break;
					}

					// Fallback: find coordinates and click
					const coords = await findClickableByLabel(label);
					if (coords) {
						await computer.leftClick(coords[0], coords[1]);
						output = `Clicked "${label}" at (${coords[0]}, ${coords[1]}).`;
						break;
					}

					return {
						success: false,
						error: `Could not find element labeled "${label}". Try using screenshot + coordinate-based click.`
					};
				}

				case 'get_ui_context': {
					// Get current UI state (focused app, window, available buttons/fields)
					const uiContext = await getUIContext();
					return {
						success: true,
						output: `Current UI State:\n${uiContext}\n\nUse find_and_click with a button label, or screenshot + coordinates for unlisted elements.`
					};
				}

				case 'get_buttons': {
					// List all buttons in the current window
					const buttons = await getButtons(args.app_name as string | undefined);
					if (buttons.length === 0) {
						return {
							success: true,
							output:
								'No buttons found in current window. Try screenshot to see the UI.'
						};
					}
					return {
						success: true,
						output: `Available buttons (${buttons.length}):\n${buttons.map((b) => `  - "${b}"`).join('\n')}\n\nUse find_and_click with any of these labels.`
					};
				}

				case 'activate_app': {
					// Bring an application to the front
					if (!args.app_name)
						return {
							success: false,
							error: 'activate_app requires app_name parameter'
						};
					const appName = args.app_name as string;
					const activated = await activateApp(appName);
					if (activated) {
						output = `Activated "${appName}".`;
						// Take verification screenshot
						await new Promise((r) => setTimeout(r, 500));
						const verifyScreenshot = await takeScreenshotForAPI(false);
						return {
							success: true,
							output: `${output} Window now in focus.`,
							content: [
								{
									type: 'image',
									data: verifyScreenshot.base64,
									mimeType: 'image/png'
								}
							]
						};
					}
					return {
						success: false,
						error: `Could not activate "${appName}". Check if the app is running.`
					};
				}

				case 'get_focused_app': {
					const app = await getFocusedApp();
					return { success: true, output: `Currently focused: ${app}` };
				}

				default:
					return {
						success: false,
						error: `Unknown action: ${actionType}. SMART: find_and_click, get_ui_context, get_buttons, activate_app. COORDINATE: screenshot, left_click, type, key, scroll, etc.`
					};
			}

			// Automatic Visual Verification for state-changing actions
			const interactionActions = [
				'left_click',
				'right_click',
				'double_click',
				'triple_click',
				'type',
				'key',
				'left_click_drag',
				'batch',
				'find_and_click'
			];
			if (interactionActions.includes(actionType as string)) {
				// Pause slightly for the UI to update
				await new Promise((resolve) => setTimeout(resolve, 500));
				// Use API-optimized screenshot with cursor for verification
				const verifyScreenshot = await takeScreenshotForAPI(true);
				return {
					success: true,
					output: `${output || 'Action executed.'} Verification captured (${verifyScreenshot.width}x${verifyScreenshot.height}).`,
					content: [
						{
							type: 'image',
							data: verifyScreenshot.base64,
							mimeType: 'image/png'
						}
					]
				};
			}

			return {
				success: true,
				output: output || 'Computer action executed successfully.'
			};
		} catch (error: unknown) {
			return {
				success: false,
				error: `Computer action failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
};
