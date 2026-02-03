// src/computer/types.ts

export type ComputerAction =
  | { action: 'screenshot' }
  | { action: 'left_click'; coordinate: [number, number]; text?: string }
  | { action: 'type'; text: string }
  | { action: 'key'; key: string }
  | { action: 'mouse_move'; coordinate: [number, number] }
  | { action: 'scroll'; coordinate: [number, number]; scroll_direction: 'up' | 'down' | 'left' | 'right'; scroll_amount: number; text?: string }
  | { action: 'left_click_drag'; start_coordinate: [number, number]; end_coordinate: [number, number] }
  | { action: 'right_click'; coordinate: [number, number]; text?: string }
  | { action: 'middle_click'; coordinate: [number, number]; text?: string }
  | { action: 'double_click'; coordinate: [number, number]; text?: string }
  | { action: 'triple_click'; coordinate: [number, number]; text?: string }
  | { action: 'left_mouse_down'; coordinate: [number, number] }
  | { action: 'left_mouse_up'; coordinate: [number, number] }
  | { action: 'hold_key'; key: string; duration: number }
  | { action: 'wait'; duration: number }
  | { action: 'zoom'; region: [number, number, number, number] };

export interface ComputerInterface {
  takeScreenshot(): Promise<string>; // Returns base64 image
  leftClick(x: number, y: number, modifier?: string): Promise<void>;
  typeText(text: string): Promise<void>;
  pressKey(key: string): Promise<void>;
  mouseMove(x: number, y: number): Promise<void>;
  scroll(x: number, y: number, direction: 'up' | 'down' | 'left' | 'right', amount: number, modifier?: string): Promise<void>;
  leftClickDrag(startX: number, startY: number, endX: number, endY: number): Promise<void>;
  rightClick(x: number, y: number, modifier?: string): Promise<void>;
  middleClick(x: number, y: number, modifier?: string): Promise<void>;
  doubleClick(x: number, y: number, modifier?: string): Promise<void>;
  tripleClick(x: number, y: number, modifier?: string): Promise<void>;
  leftMouseDown(x: number, y: number): Promise<void>;
  leftMouseUp(x: number, y: number): Promise<void>;
  holdKey(key: string, duration: number): Promise<void>;
  wait(duration: number): Promise<void>;
  zoom(x1: number, y1: number, x2: number, y2: number): Promise<string>; // Returns base64 image of the zoomed region
}
