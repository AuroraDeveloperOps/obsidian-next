// src/computer/screenshot.ts
import { shell } from './shell.js';
import * as fs from 'fs';
import { ScreenshotError } from './errors.js';

export async function takeScreenshot(): Promise<string> {
  const screenshotPath = `/tmp/screenshot-${Date.now()}.png`;
  try {
    await shell.execute(`screencapture -x ${screenshotPath}`);
    const imageBuffer = fs.readFileSync(screenshotPath);
    return imageBuffer.toString('base64');
  } catch (error: any) {
    throw new ScreenshotError('Failed to capture screenshot', error);
  } finally {
    if (fs.existsSync(screenshotPath)) {
      fs.unlinkSync(screenshotPath);
    }
  }
}

export async function zoom(x1: number, y1: number, x2: number, y2: number): Promise<string> {
  const regionScreenshotPath = `/tmp/screenshot_region-${Date.now()}.png`;
  const width = x2 - x1;
  const height = y2 - y1;
  try {
    await shell.execute(`screencapture -x -R ${x1},${y1},${width},${height} ${regionScreenshotPath}`);
    const imageBuffer = fs.readFileSync(regionScreenshotPath);
    return imageBuffer.toString('base64');
  } catch (error: any) {
    throw new ScreenshotError('Failed to capture region screenshot', error);
  } finally {
    if (fs.existsSync(regionScreenshotPath)) {
      fs.unlinkSync(regionScreenshotPath);
    }
  }
}
