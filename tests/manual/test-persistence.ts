
import { mcp } from '../src/core/mcp.js';
import fs from 'fs/promises';
import path from 'path';

async function runTest() {
    console.log("Checking MCP Persistence...");

    // Ensure .obsidian/mcp.json exists with a test server
    const configPath = path.join(process.cwd(), '.obsidian', 'mcp.json');
    const testConfig = {
        servers: {
            "test-persistence": {
                command: "echo",
                args: ["persistence works"]
            }
        }
    };

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(testConfig, null, 2));

    console.log("Initialization starting...");
    await mcp.init();

    const status = mcp.getStatus();
    const found = status.find(s => s.name === "test-persistence");

    if (found) {
        console.log("✅ Verification: 'test-persistence' server was loaded from disk.");
        // Cleanup
        await mcp.removeServer("test-persistence");
        console.log("Test Complete.");
    } else {
        console.error("❌ Failed: 'test-persistence' server not found in manager.");
        process.exit(1);
    }
}

runTest().catch(e => {
    console.error("Test Error:", e);
    process.exit(1);
});
