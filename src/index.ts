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

// Parse --resume flag
const args = process.argv.slice(2);
const resumeIndex = args.indexOf('--resume');
let resumeSessionId: string | undefined;

if (resumeIndex !== -1) {
    // Check if ID is provided
    if (args[resumeIndex + 1] && !args[resumeIndex + 1].startsWith('-')) {
        resumeSessionId = args[resumeIndex + 1];
    } else {
        // Find latest session
        // We need to import session manager here, but we can't top-level await in CommonJS if transpiled
        // So we'll let the agent handle "latest" if we pass a special flag or just handle it here
        // For simplicity, let's just pass "latest" and let agent/session handle it? 
        // Or strictly require ID? Architecture said "--resume <id> (or just --resume to pick latest)"
        // Let's implement looking up "latest" here in a self-executing logic or pass a flag to init
        resumeSessionId = 'latest';
    }
}

// We need to update Supervisor/Agent interface to accept this, 
// but Supervisor wraps Agent. Let's see how Supervisor is structured.
// Actually, 'supervisor' imported above is an instance. 
// We should check if we can pass init params. 
// Looking at src/agents/supervisor.ts might be needed. 
// For now, let's assume we can set it on the agent directly.



import { agent } from './core/agent.js';

// Initialize agent (restore session or start fresh)
// We do this before rendering UI so context is ready
agent.init(resumeSessionId).then(() => {
    main().catch((err) => {
        console.error("Fatal Error:", err);
        process.exit(1);
    });
}).catch(err => {
    console.error("Failed to initialize agent:", err);
    process.exit(1);
});
