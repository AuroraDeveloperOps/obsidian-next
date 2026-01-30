#!/usr/bin/env node
/**
 * MCP Server Entry Point
 *
 * Run with: npx obsidian-mcp
 * Or: node dist/mcp.js
 */

import { startMcpServer } from './server.js';

startMcpServer().catch((error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
});
