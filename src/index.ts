#!/usr/bin/env node
import { bus } from './core/bus.js';

/**
 * Obsidian Next CLI Entry Point
 */
async function main() {
    // 1. Welcome Message
    bus.emitAgent({
        type: 'thought',
        content: 'Initializing Obsidian Next v0.1.0...'
    });

    // TODO: Initialize Ink UI here
    console.log("Obsidian Next Initialized. (Ink UI implementation impending)");

    // Keep process alive for now
    process.stdin.resume();
}

main().catch((err) => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
