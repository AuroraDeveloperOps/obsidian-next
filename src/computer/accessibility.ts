// src/computer/accessibility.ts
/**
 * macOS Accessibility API Integration
 *
 * Provides programmatic access to UI elements for smarter computer use:
 * - Find elements by label/title
 * - Get focused application
 * - List windows
 * - Query UI element properties
 *
 * Uses AppleScript/JXA to interact with System Events accessibility API.
 */

import { shell } from './shell.js';

export interface UIElement {
    name: string;
    role: string;
    position: [number, number];
    size: [number, number];
    enabled: boolean;
    focused: boolean;
}

export interface WindowInfo {
    name: string;
    app: string;
    position: [number, number];
    size: [number, number];
    focused: boolean;
}

/**
 * Get the currently focused application name
 */
export async function getFocusedApp(): Promise<string> {
    try {
        const script = `
            tell application "System Events"
                set frontApp to first application process whose frontmost is true
                return name of frontApp
            end tell
        `;
        const { stdout } = await shell.execute(`osascript -e '${script}'`);
        return stdout.trim();
    } catch (error) {
        return 'Unknown';
    }
}

/**
 * Get the title of the frontmost window
 */
export async function getFocusedWindowTitle(): Promise<string> {
    try {
        const script = `
            tell application "System Events"
                set frontApp to first application process whose frontmost is true
                tell frontApp
                    if (count of windows) > 0 then
                        return name of window 1
                    else
                        return ""
                    end if
                end tell
            end tell
        `;
        const { stdout } = await shell.execute(`osascript -e '${script}'`);
        return stdout.trim();
    } catch (error) {
        return '';
    }
}

/**
 * List all visible windows across applications
 */
export async function listWindows(): Promise<WindowInfo[]> {
    try {
        const script = `
            set output to ""
            tell application "System Events"
                repeat with proc in (every process whose visible is true)
                    set procName to name of proc
                    repeat with win in windows of proc
                        try
                            set winName to name of win
                            set winPos to position of win
                            set winSize to size of win
                            set output to output & procName & "|" & winName & "|" & (item 1 of winPos) & "," & (item 2 of winPos) & "|" & (item 1 of winSize) & "," & (item 2 of winSize) & "\\n"
                        end try
                    end repeat
                end repeat
            end tell
            return output
        `;
        const { stdout } = await shell.execute(`osascript -e '${script}'`);

        const windows: WindowInfo[] = [];
        for (const line of stdout.trim().split('\n')) {
            if (!line) continue;
            const [app, name, posStr, sizeStr] = line.split('|');
            if (!posStr || !sizeStr) continue;

            const pos = posStr.split(',').map(Number) as [number, number];
            const size = sizeStr.split(',').map(Number) as [number, number];

            windows.push({
                name: name || '',
                app: app || '',
                position: pos,
                size: size,
                focused: false
            });
        }
        return windows;
    } catch (error) {
        return [];
    }
}

/**
 * Find a UI element by its label/name in the focused application
 * Returns the center coordinates if found
 */
export async function findElementByLabel(
    label: string,
    appName?: string
): Promise<{ x: number; y: number; width: number; height: number } | null> {
    try {
        const targetApp = appName || await getFocusedApp();

        // Search for button, text field, or any element with matching name
        const script = `
            tell application "System Events"
                tell process "${targetApp}"
                    set targetElements to every UI element of window 1 whose name contains "${label}"
                    if (count of targetElements) > 0 then
                        set el to item 1 of targetElements
                        set elPos to position of el
                        set elSize to size of el
                        return (item 1 of elPos) & "," & (item 2 of elPos) & "," & (item 1 of elSize) & "," & (item 2 of elSize)
                    end if

                    -- Try deeper search in groups/scroll areas
                    set allGroups to every group of window 1
                    repeat with grp in allGroups
                        try
                            set targetElements to every UI element of grp whose name contains "${label}"
                            if (count of targetElements) > 0 then
                                set el to item 1 of targetElements
                                set elPos to position of el
                                set elSize to size of el
                                return (item 1 of elPos) & "," & (item 2 of elPos) & "," & (item 1 of elSize) & "," & (item 2 of elSize)
                            end if
                        end try
                    end repeat

                    return ""
                end tell
            end tell
        `;

        const { stdout } = await shell.execute(`osascript -e '${script}'`);
        const result = stdout.trim();

        if (!result) return null;

        const [x, y, width, height] = result.split(',').map(Number);
        return { x, y, width, height };
    } catch (error) {
        return null;
    }
}

/**
 * Find a clickable element (button, link, etc.) by label
 * Returns center coordinates for clicking
 */
export async function findClickableByLabel(label: string): Promise<[number, number] | null> {
    const element = await findElementByLabel(label);
    if (!element) return null;

    // Return center of element for clicking
    const centerX = Math.round(element.x + element.width / 2);
    const centerY = Math.round(element.y + element.height / 2);
    return [centerX, centerY];
}

/**
 * Click on a UI element by its label (accessibility-based click)
 */
export async function clickElementByLabel(label: string, appName?: string): Promise<boolean> {
    try {
        const targetApp = appName || await getFocusedApp();

        const script = `
            tell application "System Events"
                tell process "${targetApp}"
                    set targetElements to every button of window 1 whose name contains "${label}"
                    if (count of targetElements) > 0 then
                        click item 1 of targetElements
                        return "clicked"
                    end if

                    -- Try menu items
                    set targetMenus to every menu item of every menu of menu bar 1 whose name contains "${label}"
                    if (count of targetMenus) > 0 then
                        click item 1 of targetMenus
                        return "clicked"
                    end if

                    return "not_found"
                end tell
            end tell
        `;

        const { stdout } = await shell.execute(`osascript -e '${script}'`);
        return stdout.trim() === 'clicked';
    } catch (error) {
        return false;
    }
}

/**
 * Get all buttons in the current window
 */
export async function getButtons(appName?: string): Promise<string[]> {
    try {
        const targetApp = appName || await getFocusedApp();

        const script = `
            set buttonNames to {}
            tell application "System Events"
                tell process "${targetApp}"
                    if (count of windows) > 0 then
                        set allButtons to every button of window 1
                        repeat with btn in allButtons
                            try
                                set end of buttonNames to name of btn
                            end try
                        end repeat
                    end if
                end tell
            end tell
            return buttonNames as text
        `;

        const { stdout } = await shell.execute(`osascript -e '${script}'`);
        return stdout.trim().split(', ').filter(b => b);
    } catch (error) {
        return [];
    }
}

/**
 * Get all text fields in the current window
 */
export async function getTextFields(appName?: string): Promise<string[]> {
    try {
        const targetApp = appName || await getFocusedApp();

        const script = `
            set fieldNames to {}
            tell application "System Events"
                tell process "${targetApp}"
                    if (count of windows) > 0 then
                        set allFields to every text field of window 1
                        repeat with fld in allFields
                            try
                                set end of fieldNames to description of fld
                            end try
                        end repeat
                    end if
                end tell
            end tell
            return fieldNames as text
        `;

        const { stdout } = await shell.execute(`osascript -e '${script}'`);
        return stdout.trim().split(', ').filter(f => f);
    } catch (error) {
        return [];
    }
}

/**
 * Activate (bring to front) an application
 */
export async function activateApp(appName: string): Promise<boolean> {
    try {
        const script = `
            tell application "${appName}"
                activate
            end tell
            return "ok"
        `;
        const { stdout } = await shell.execute(`osascript -e '${script}'`);
        return stdout.trim() === 'ok';
    } catch (error) {
        return false;
    }
}

/**
 * Type text into the focused field using System Events (more reliable than cliclick)
 */
export async function typeTextAccessibility(text: string): Promise<boolean> {
    try {
        // Escape special characters for AppleScript
        const escaped = text
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');

        const script = `
            tell application "System Events"
                keystroke "${escaped}"
            end tell
            return "ok"
        `;
        const { stdout } = await shell.execute(`osascript -e '${script}'`);
        return stdout.trim() === 'ok';
    } catch (error) {
        return false;
    }
}

/**
 * Press a key using System Events
 */
export async function pressKeyAccessibility(key: string): Promise<boolean> {
    try {
        // Map common key names to key codes
        const keyCodeMap: Record<string, number> = {
            'return': 36, 'enter': 36,
            'escape': 53, 'esc': 53,
            'tab': 48,
            'space': 49,
            'delete': 51, 'backspace': 51,
            'up': 126, 'down': 125, 'left': 123, 'right': 124,
            'home': 115, 'end': 119,
            'pageup': 116, 'pagedown': 121,
        };

        const keyLower = key.toLowerCase();
        const keyCode = keyCodeMap[keyLower];

        let script: string;
        if (keyCode) {
            script = `
                tell application "System Events"
                    key code ${keyCode}
                end tell
                return "ok"
            `;
        } else if (key.length === 1) {
            script = `
                tell application "System Events"
                    keystroke "${key}"
                end tell
                return "ok"
            `;
        } else {
            return false;
        }

        const { stdout } = await shell.execute(`osascript -e '${script}'`);
        return stdout.trim() === 'ok';
    } catch (error) {
        return false;
    }
}

/**
 * Get a summary of the current UI state for the agent
 */
export async function getUIContext(): Promise<string> {
    const [app, windowTitle, buttons, textFields] = await Promise.all([
        getFocusedApp(),
        getFocusedWindowTitle(),
        getButtons(),
        getTextFields()
    ]);

    const lines = [
        `Focused App: ${app}`,
        `Window: ${windowTitle || '(none)'}`,
    ];

    if (buttons.length > 0) {
        lines.push(`Buttons: ${buttons.slice(0, 10).join(', ')}${buttons.length > 10 ? '...' : ''}`);
    }

    if (textFields.length > 0) {
        lines.push(`Text Fields: ${textFields.slice(0, 5).join(', ')}${textFields.length > 5 ? '...' : ''}`);
    }

    return lines.join('\n');
}
