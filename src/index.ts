#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Root } from './ui/Root.js';
import { supervisor } from './agents/supervisor.js';

/**
 * Obsidian Next CLI Entry Point
 */
async function main() {
    // Enter Alternate Screen Buffer
    process.stdout.write('\x1b[?1049h');
    process.stdout.write('\x1Bc'); // Clear screen

    // Render the React Ink UI
    const { waitUntilExit, cleanup } = render(React.createElement(Root), {
        patchConsole: false,
        exitOnCtrlC: true
    });

    try {
        await waitUntilExit();
    } catch (error) {
        console.error("Runtime Error:", error);
    } finally {
        // Exit Alternate Screen Buffer
        process.stdout.write('\x1b[?1049l');
        process.exit(0);
    }
}

main().catch((err) => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
