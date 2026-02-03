// src/computer/keyboard.ts
import { shell } from './shell.js';

// Note: cliclick needs to be installed. `brew install cliclick`

export async function typeText(text: string): Promise<void> {
  // Escape special characters for cliclick 't:' command
  const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  await shell.execute(`cliclick t:"${escapedText}"`);
}

export async function pressKey(key: string): Promise<void> {
  if (!key) {
    throw new Error('Key is required for pressKey action');
  }
  // Map common keys if cliclick has different names
  let cliclickKey = key.toLowerCase();
  switch (cliclickKey) {
    case 'enter':
    case 'return':
      cliclickKey = 'return';
      break;
    case 'escape':
      cliclickKey = 'esc';
      break;
    case 'tab':
      cliclickKey = 'tab';
      break;
    case 'backspace':
      cliclickKey = 'delete'; // macOS 'delete' is backspace
      break;
    case 'delete':
      cliclickKey = 'del'; // macOS 'fn + delete' is forward delete
      break;
    case 'shift':
    case 'ctrl':
    case 'alt':
    case 'command':
      // cliclick expects these as prefixes for other keys or as 'kd/ku'
      // This function is for single key presses, so we'll treat them as such if standalone.
      break;
    default:
      if (cliclickKey.length === 1) {
        // Assume single character keys are fine
      } else {
        console.warn(`Key "${key}" might not be directly supported or mapped correctly by cliclick.`);
      }
      break;
  }
  await shell.execute(`cliclick kp:${cliclickKey}`);
}

export async function holdKey(key: string, duration: number): Promise<void> {
  let cliclickKey = key.toLowerCase();
  switch (cliclickKey) {
    case 'shift':
      cliclickKey = 'shift';
      break;
    case 'ctrl':
      cliclickKey = 'ctrl';
      break;
    case 'alt':
      cliclickKey = 'alt';
      break;
    case 'command':
      cliclickKey = 'cmd';
      break;
    default:
      console.warn(`Holding key "${key}" might not be directly supported by cliclick in a generic way.`);
      break;
  }

  await shell.execute(`cliclick kd:${cliclickKey}`);
  await shell.execute(`sleep ${duration}`);
  await shell.execute(`cliclick ku:${cliclickKey}`);
}
