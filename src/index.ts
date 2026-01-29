#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Root } from './ui/Root.js';
import { supervisor } from './agents/supervisor.js';

/**
 * Obsidian Next CLI Entry Point
 */
async function main() {
    process.stdout.write('\x1Bc'); // Clear screen

    // Render the React Ink UI
    const { waitUntilExit } = render(React.createElement(Root));

    // Supervisor is already initialized by the import (lines 3-4)
    // The Root component in src/ui/Root.tsx subscribes to the Event Bus

    await waitUntilExit();
}

main().catch((err) => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
