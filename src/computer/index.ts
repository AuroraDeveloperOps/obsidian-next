// src/computer/index.ts
/**
 * Computer Interaction Module
 *
 * Provides cross-platform desktop automation capabilities:
 * - Screenshot capture and region zoom
 * - Mouse control (click, drag, scroll)
 * - Keyboard input (type, key press, hold)
 * - Display dimension detection
 *
 * Currently implemented for macOS using:
 * - screencapture (built-in)
 * - cliclick (brew install cliclick)
 * - sips (built-in, for image processing)
 */

import { ComputerInterface } from './types.js';
import {
  takeScreenshot,
  takeScreenshotForAPI,
  zoom,
  getDisplayDimensions,
  calculateScaleForAPI
} from './screenshot.js';
import { typeText as keyboardTypeText, pressKey, holdKey } from './keyboard.js';
import {
  leftClick,
  mouseMove,
  leftClickDrag,
  rightClick,
  middleClick,
  doubleClick,
  tripleClick,
  leftMouseDown,
  leftMouseUp,
  scroll,
  executeBatch
} from './mouse.js';
import { wait } from './utils.js';

// Re-export types
export * from './types.js';
export { ScreenshotError, ExecutionError, ComputerError } from './errors.js';

// Re-export utility functions
export { takeScreenshotForAPI, calculateScaleForAPI };

// Re-export the client for proper API integration
export { ComputerUseClient, createComputerUseClient } from './client.js';
export type { ComputerUseConfig, ScaleFactors, ToolVersion, BetaFlag } from './client.js';

// Re-export accessibility features for smarter element targeting
export {
  getFocusedApp,
  getFocusedWindowTitle,
  listWindows,
  findElementByLabel,
  findClickableByLabel,
  clickElementByLabel,
  getButtons,
  getTextFields,
  activateApp,
  typeTextAccessibility,
  pressKeyAccessibility,
  getUIContext
} from './accessibility.js';

/**
 * macOS implementation using native tools
 */
const macComputer: ComputerInterface = {
  takeScreenshot,
  leftClick,
  typeText: keyboardTypeText,
  pressKey,
  mouseMove,
  scroll,
  leftClickDrag,
  rightClick,
  middleClick,
  doubleClick,
  tripleClick,
  leftMouseDown,
  leftMouseUp,
  holdKey,
  wait,
  zoom,
  getDisplayDimensions,
  executeBatch,
};

/**
 * Placeholder for unsupported platforms
 */
const unimplementedComputer: ComputerInterface = {
  takeScreenshot: async () => { throw new Error('Computer use not implemented for this platform. Currently macOS only.'); },
  leftClick: async () => { throw new Error('Computer use not implemented for this platform.'); },
  typeText: async () => { throw new Error('Computer use not implemented for this platform.'); },
  pressKey: async () => { throw new Error('Computer use not implemented for this platform.'); },
  mouseMove: async () => { throw new Error('Computer use not implemented for this platform.'); },
  scroll: async () => { throw new Error('Computer use not implemented for this platform.'); },
  leftClickDrag: async () => { throw new Error('Computer use not implemented for this platform.'); },
  rightClick: async () => { throw new Error('Computer use not implemented for this platform.'); },
  middleClick: async () => { throw new Error('Computer use not implemented for this platform.'); },
  doubleClick: async () => { throw new Error('Computer use not implemented for this platform.'); },
  tripleClick: async () => { throw new Error('Computer use not implemented for this platform.'); },
  leftMouseDown: async () => { throw new Error('Computer use not implemented for this platform.'); },
  leftMouseUp: async () => { throw new Error('Computer use not implemented for this platform.'); },
  holdKey: async () => { throw new Error('Computer use not implemented for this platform.'); },
  wait: async () => { throw new Error('Computer use not implemented for this platform.'); },
  zoom: async () => { throw new Error('Computer use not implemented for this platform.'); },
  getDisplayDimensions: async () => { throw new Error('Computer use not implemented for this platform.'); },
  executeBatch: async () => { throw new Error('Computer use not implemented for this platform.'); },
};

/**
 * Platform-specific computer interface
 * Currently only macOS is supported
 */
export const computer: ComputerInterface = process.platform === 'darwin' ? macComputer : unimplementedComputer;

/**
 * Check if computer use is available on this platform
 */
export function isComputerUseAvailable(): boolean {
  return process.platform === 'darwin';
}

/**
 * Check if required dependencies are installed
 */
export async function checkDependencies(): Promise<{ available: boolean; missing: string[] }> {
  if (process.platform !== 'darwin') {
    return { available: false, missing: ['macOS required'] };
  }

  const { shell } = await import('./shell.js');
  const missing: string[] = [];

  // Check for cliclick
  try {
    await shell.execute('which cliclick');
  } catch {
    missing.push('cliclick (install with: brew install cliclick)');
  }

  // screencapture and sips are built-in on macOS

  return {
    available: missing.length === 0,
    missing
  };
}
