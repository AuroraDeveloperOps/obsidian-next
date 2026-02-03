// src/computer/index.ts
import { ComputerInterface } from './types.js';
import { takeScreenshot, zoom } from './screenshot.js';
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
  scroll
} from './mouse.js';
import { wait } from './utils.js';

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
};

// Placeholder for other platforms
const unimplementedComputer: ComputerInterface = {
  takeScreenshot: async () => { throw new Error('Not implemented for this platform.'); },
  leftClick: async () => { throw new Error('Not implemented for this platform.'); },
  typeText: async () => { throw new Error('Not implemented for this platform.'); },
  pressKey: async () => { throw new Error('Not implemented for this platform.'); },
  mouseMove: async () => { throw new Error('Not implemented for this platform.'); },
  scroll: async () => { throw new Error('Not implemented for this platform.'); },
  leftClickDrag: async () => { throw new Error('Not implemented for this platform.'); },
  rightClick: async () => { throw new Error('Not implemented for this platform.'); },
  middleClick: async () => { throw new Error('Not implemented for this platform.'); },
  doubleClick: async () => { throw new Error('Not implemented for this platform.'); },
  tripleClick: async () => { throw new Error('Not implemented for this platform.'); },
  leftMouseDown: async () => { throw new Error('Not implemented for this platform.'); },
  leftMouseUp: async () => { throw new Error('Not implemented for this platform.'); },
  holdKey: async () => { throw new Error('Not implemented for this platform.'); },
  wait: async () => { throw new Error('Not implemented for this platform.'); },
  zoom: async () => { throw new Error('Not implemented for this platform.'); },
};

export const computer: ComputerInterface = process.platform === 'darwin' ? macComputer : unimplementedComputer;
