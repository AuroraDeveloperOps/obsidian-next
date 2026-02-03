// src/computer/screenshot.ts
import { shell } from './shell.js';
import * as fs from 'fs';
import { ScreenshotError } from './errors.js';

// API Image Constraints (per Anthropic docs)
// Screenshots are downscaled to these limits to save tokens
// Coordinates from Claude must be scaled back up to native resolution
const MAX_LONG_EDGE = 1568;
const MAX_PIXELS = 1_150_000;

/**
 * Get the current display dimensions
 * Falls back to 1920x1080 if detection fails
 */
export async function getDisplayDimensions(): Promise<{ width: number; height: number }> {
  try {
    // Try multiple methods for robustness
    // Method 1: system_profiler (most reliable on macOS)
    try {
      const { stdout } = await shell.execute(
        "system_profiler SPDisplaysDataType | grep Resolution | head -1 | awk '{print $2, $4}'"
      );
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 2) {
        const width = parseInt(parts[0], 10);
        const height = parseInt(parts[1], 10);
        if (width > 0 && height > 0) {
          return { width, height };
        }
      }
    } catch {}

    // Method 2: osascript with Finder (legacy)
    try {
      const { stdout } = await shell.execute(
        "osascript -e 'tell application \"Finder\" to get bounds of window of desktop'"
      );
      const parts = stdout.trim().split(',').map((p: string) => parseInt(p.trim(), 10));
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return { width: parts[2], height: parts[3] };
      }
    } catch {}

    // Method 3: screenresolution tool if available
    try {
      const { stdout } = await shell.execute("screenresolution get 2>/dev/null || echo ''");
      const match = stdout.match(/(\d+)\s*x\s*(\d+)/);
      if (match) {
        return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
      }
    } catch {}

  } catch (error) {
    // All methods failed
  }

  return { width: 1920, height: 1080 };
}

/**
 * Calculate optimal scale factor for API constraints
 * Images are constrained to max 1568px on longest edge and ~1.15MP total
 */
export function calculateScaleForAPI(width: number, height: number): number {
  const longEdge = Math.max(width, height);
  const totalPixels = width * height;

  const longEdgeScale = MAX_LONG_EDGE / longEdge;
  const totalPixelsScale = Math.sqrt(MAX_PIXELS / totalPixels);

  return Math.min(1.0, longEdgeScale, totalPixelsScale);
}

/**
 * Take a screenshot with optional cursor capture
 *
 * @param captureCursor - Whether to include the cursor in the screenshot
 * @returns Base64 encoded PNG image
 */
export async function takeScreenshot(captureCursor: boolean = false): Promise<string> {
  const screenshotPath = `/tmp/screenshot-${Date.now()}.png`;
  const flags = captureCursor ? '-x -C' : '-x';
  try {
    await shell.execute(`screencapture ${flags} ${screenshotPath}`);
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

/**
 * Take a screenshot and resize it for the Anthropic API
 * This ensures the image fits within API constraints while maintaining aspect ratio
 *
 * @param captureCursor - Whether to include the cursor
 * @param targetWidth - Optional target width (auto-calculated if not provided)
 * @param targetHeight - Optional target height (auto-calculated if not provided)
 * @returns Base64 encoded resized PNG image
 */
export async function takeScreenshotForAPI(
  captureCursor: boolean = false,
  targetWidth?: number,
  targetHeight?: number
): Promise<{ base64: string; width: number; height: number; scale: number }> {
  const screenshotPath = `/tmp/screenshot-${Date.now()}.png`;
  const resizedPath = `/tmp/screenshot-resized-${Date.now()}.png`;
  const flags = captureCursor ? '-x -C' : '-x';

  try {
    // Capture full resolution screenshot
    await shell.execute(`screencapture ${flags} ${screenshotPath}`);

    // Get original dimensions using sips
    const { stdout: sizeOutput } = await shell.execute(
      `sips -g pixelWidth -g pixelHeight ${screenshotPath} | tail -2`
    );

    const widthMatch = sizeOutput.match(/pixelWidth:\s*(\d+)/);
    const heightMatch = sizeOutput.match(/pixelHeight:\s*(\d+)/);

    const originalWidth = widthMatch ? parseInt(widthMatch[1], 10) : 1920;
    const originalHeight = heightMatch ? parseInt(heightMatch[1], 10) : 1080;

    // Calculate scale if not provided
    const scale = calculateScaleForAPI(originalWidth, originalHeight);
    const finalWidth = targetWidth || Math.floor(originalWidth * scale);
    const finalHeight = targetHeight || Math.floor(originalHeight * scale);

    if (scale < 1.0) {
      // Resize using sips (macOS built-in)
      await shell.execute(
        `sips -z ${finalHeight} ${finalWidth} ${screenshotPath} --out ${resizedPath}`
      );
      const imageBuffer = fs.readFileSync(resizedPath);
      return {
        base64: imageBuffer.toString('base64'),
        width: finalWidth,
        height: finalHeight,
        scale
      };
    } else {
      // No resize needed
      const imageBuffer = fs.readFileSync(screenshotPath);
      return {
        base64: imageBuffer.toString('base64'),
        width: originalWidth,
        height: originalHeight,
        scale: 1.0
      };
    }
  } catch (error: any) {
    throw new ScreenshotError('Failed to capture/resize screenshot', error);
  } finally {
    // Cleanup temp files
    for (const p of [screenshotPath, resizedPath]) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
  }
}

/**
 * Capture a specific region of the screen at full resolution
 * This is the 'zoom' action from Anthropic's computer_20251124 (Opus 4.5)
 *
 * @param x1 - Top-left X coordinate
 * @param y1 - Top-left Y coordinate
 * @param x2 - Bottom-right X coordinate
 * @param y2 - Bottom-right Y coordinate
 * @returns Base64 encoded PNG image of the region
 */
export async function zoom(x1: number, y1: number, x2: number, y2: number): Promise<string> {
  const regionScreenshotPath = `/tmp/screenshot_region-${Date.now()}.png`;

  // Ensure coordinates are valid
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);

  if (width <= 0 || height <= 0) {
    throw new ScreenshotError('Invalid region dimensions', new Error(`Width: ${width}, Height: ${height}`));
  }

  try {
    // macOS screencapture -R takes: x,y,width,height
    await shell.execute(`screencapture -x -R ${left},${top},${width},${height} ${regionScreenshotPath}`);
    const imageBuffer = fs.readFileSync(regionScreenshotPath);
    return imageBuffer.toString('base64');
  } catch (error: any) {
    throw new ScreenshotError(`Failed to capture region (${left},${top},${width}x${height})`, error);
  } finally {
    if (fs.existsSync(regionScreenshotPath)) {
      try { fs.unlinkSync(regionScreenshotPath); } catch {}
    }
  }
}
