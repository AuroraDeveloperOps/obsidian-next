/**
 * Computer Use mode utilities
 */

import Anthropic from '@anthropic-ai/sdk';
import { bus } from '../bus.js';
import {
	calculateScaleForAPI,
	getDisplayDimensions
} from '../../computer/screenshot.js';
import { ComputerUseState, ContentBlock } from './shared.js';

/**
 * Enable Computer Use mode with proper Anthropic beta API
 * This activates:
 * - Beta header (computer-use-2025-01-24 or computer-use-2025-11-24)
 * - Anthropic-defined schema-less tools
 * - Coordinate scaling for high-res displays
 */
export async function enableComputerUse(
	state: ComputerUseState
): Promise<void> {
	const dims = await getDisplayDimensions();
	const scale = calculateScaleForAPI(dims.width, dims.height);

	state.enabled = true;
	state.displayWidth = dims.width;
	state.displayHeight = dims.height;
	state.scale = scale;
	state.scaledWidth = Math.floor(dims.width * scale);
	state.scaledHeight = Math.floor(dims.height * scale);

	bus.emitAgent({
		type: 'thought',
		content: `[Computer Use] Enabled. Display: ${dims.width}x${dims.height}, API Scale: ${scale.toFixed(3)} -> ${state.scaledWidth}x${state.scaledHeight}`,
		hidden: false
	});
}

/**
 * Disable Computer Use mode
 */
export function disableComputerUse(state: ComputerUseState): void {
	state.enabled = false;
	bus.emitAgent({
		type: 'thought',
		content: '[Computer Use] Disabled.',
		hidden: false
	});
}

/**
 * Update the scale factor (called after screenshot to ensure accuracy)
 */
export function updateComputerScale(
	state: ComputerUseState,
	actualScale: number,
	scaledWidth: number,
	scaledHeight: number
): void {
	if (state.enabled && actualScale > 0) {
		state.scale = actualScale;
		state.scaledWidth = scaledWidth;
		state.scaledHeight = scaledHeight;
		state.displayWidth = Math.round(scaledWidth / actualScale);
		state.displayHeight = Math.round(scaledHeight / actualScale);
	}
}

/**
 * Prune old images from conversation history to prevent context explosion
 * Keeps only the most recent N images, replacing older ones with text placeholders
 */
export function pruneImagesFromHistory(
	conversationHistory: Anthropic.MessageParam[],
	keepCount: number
): void {
	const imageLocations: { msgIdx: number; blockIdx: number }[] = [];

	for (let i = conversationHistory.length - 1; i >= 0; i--) {
		const msg = conversationHistory[i];
		if (Array.isArray(msg.content)) {
			for (
				let j = (msg.content as unknown as ContentBlock[]).length - 1;
				j >= 0;
				j--
			) {
				const block = (msg.content as unknown as ContentBlock[])[j];
				if (
					block.type === 'image' ||
					(block.type === 'tool_result' && Array.isArray(block.content))
				) {
					if (block.type === 'tool_result' && Array.isArray(block.content)) {
						for (let k = block.content.length - 1; k >= 0; k--) {
							if (block.content[k].type === 'image') {
								imageLocations.push({ msgIdx: i, blockIdx: j });
								break;
							}
						}
					} else if (block.type === 'image') {
						imageLocations.push({ msgIdx: i, blockIdx: j });
					}
				}
			}
		}
	}

	const toRemove = imageLocations.slice(keepCount);

	for (const loc of toRemove) {
		const msg = conversationHistory[loc.msgIdx];
		if (Array.isArray(msg.content)) {
			const block = (msg.content as unknown as ContentBlock[])[loc.blockIdx];

			if (block.type === 'tool_result' && Array.isArray(block.content)) {
				block.content = (block.content as ContentBlock[]).map(
					(c: ContentBlock) =>
						c.type === 'image'
							? {
									type: 'text',
									text: '[Previous screenshot removed to save context]'
								}
							: c
				);
			} else if (block.type === 'image') {
				(msg.content as unknown as ContentBlock[])[loc.blockIdx] = {
					type: 'text',
					text: '[Previous screenshot removed to save context]'
				};
			}
		}
	}

	if (toRemove.length > 0) {
		bus.emitAgent({
			type: 'thought',
			content: `[Context] Pruned ${toRemove.length} old screenshot(s) to save context.`,
			hidden: true
		});
	}
}
