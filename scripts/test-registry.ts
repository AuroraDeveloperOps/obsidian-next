
import { mcp } from '../src/core/mcp.js';
import { tools } from '../src/core/tools.js';

async function runTest() {
    console.log("Initializing MCP...");
    await mcp.init();

    console.log("Getting mcp_manage tool...");
    const tool = tools.get('mcp_manage');
    if (!tool) {
        throw new Error("mcp_manage tool not found!");
    }

    const requestedServer = 'filesystem'; // From registry

    // Test INSTALL
    console.log(`Agent installing server '${requestedServer}' from registry...`);
    const installResult = await tool.execute({
        action: 'install',
        name: requestedServer
    });

    if (!installResult.success) {
        // If it fails because it exists, that's "okay" for a test, but let's try to remove it first
        if (installResult.error?.includes('already exists')) {
            console.log("Server already exists, removing first...");
            await tool.execute({ action: 'remove', name: requestedServer });
            // Retry install
            const retry = await tool.execute({ action: 'install', name: requestedServer });
            if (!retry.success) throw new Error(`Retry install failed: ${retry.error}`);
        } else {
            throw new Error(`Agent failed to install server: ${installResult.error}`);
        }
    } else {
        console.log("Install Result:", installResult.output);
    }

    // Verify connection behaves
    const status = mcp.getStatus();
    const server = status.find(s => s.name === requestedServer);
    if (!server || !server.connected) {
        throw new Error("Server not connected after Agent installed it");
    }
    console.log(`✅ Verification: Server '${server.name}' is connected.`);

    // Cleanup
    await mcp.removeServer(requestedServer);
    console.log("Test Complete.");
}

runTest().catch(e => {
    console.error("Test Failed:", e);
    process.exit(1);
});
