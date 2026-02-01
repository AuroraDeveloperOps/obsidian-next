
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

    const serverName = 'agent-fs-test';

    // Test ADD
    console.log(`Agent adding server '${serverName}'...`);
    const addResult = await tool.execute({
        action: 'add',
        name: serverName,
        command: 'npx',
        args: '-y @modelcontextprotocol/server-filesystem ' + process.cwd()
    });

    if (!addResult.success) {
        throw new Error(`Agent failed to add server: ${addResult.error}`);
    }
    console.log("Add Result:", addResult.output);

    // Verify connection behaves
    const status = mcp.getStatus();
    const server = status.find(s => s.name === serverName);
    if (!server || !server.connected) {
        throw new Error("Server not connected after Agent added it");
    }
    console.log("✅ Verification: Server is connected.");

    // Test REMOVE
    console.log(`Agent removing server '${serverName}'...`);
    const removeResult = await tool.execute({
        action: 'remove',
        name: serverName
    });

    if (!removeResult.success) {
        // If it fails, maybe clean up manually
        await mcp.removeServer(serverName).catch(() => { });
        throw new Error(`Agent failed to remove server: ${removeResult.error}`);
    }
    console.log("Remove Result:", removeResult.output);

    // Verify removal
    const statusAfter = mcp.getStatus();
    if (statusAfter.find(s => s.name === serverName)) {
        throw new Error("Server still exists after Agent removed it");
    }
    console.log("✅ Verification: Server is removed.");
}

runTest().catch(e => {
    console.error("Test Failed:", e);
    process.exit(1);
});
