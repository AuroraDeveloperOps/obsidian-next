#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Root } from './ui/Root.js';
import { supervisor } from './agents/supervisor.js';

async function main() {
    // process.stdout.write('\x1b[?1049h'); // Disable Alt Screen to allow native scrolling
    process.stdout.write('\x1b[2J');     // Clear Screen
    process.stdout.write('\x1b[3J');     // Clear Scrollback
    process.stdout.write('\x1b[H');      // Move cursor to top-left
    const { waitUntilExit, cleanup } = render(React.createElement(Root), {
        patchConsole: false,
        exitOnCtrlC: false
    });

    try {
        await waitUntilExit();
    } catch (error) {
        console.error("Runtime Error:", error);
    } finally {
        process.stdout.write('\x1b[?1049l');
        process.exit(0);
    }
}

// Ensure supervisor is initialized and included in build
if (!supervisor) {
    console.error("Fatal: Supervisor failed to initialize");
    process.exit(1);
}

main().catch((err) => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
