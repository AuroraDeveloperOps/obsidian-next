
import { mcp } from '../src/core/mcp.js';
import { tools } from '../src/core/tools.js';

async function runTest() {
    console.log("Initializing MCP...");
    await mcp.init();

    console.log("Adding 'filesystem' server...");
    try {
        await mcp.addServer('test-fs', {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()]
        });
        console.log("Server added and connected!");
    } catch (e: any) {
        if (e.message.includes('already exists')) {
            console.log("Server already exists, reconnecting...");
            await mcp.connect('test-fs', {
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()]
            });
        } else {
            throw e;
        }
    }

    console.log("Listing tools...");
    const toolList = await tools.list();
    const fsTools = toolList.filter(t => t.name.startsWith('filesystem_') || t.name === 'list_directory'); // Name might vary

    // Note: server-filesystem usually exports tool names like 'list_directory', 'read_file', etc.
    // They are NOT namespaced by default unless we did it.
    // My implementation in mcp.ts did:
    // const serverTools = result.tools.map((t: any) => ({ ...t, server: serverName }));
    // It did NOT rename them.
    // But wait, if multiple servers export 'read_file', we have a collision.
    // I left a comment in mcp.ts: "Namespace tools to avoid collisions? ... Let's keep original for now".

    console.log("Found tools:", toolList.map(t => t.name).join(', '));

    if (toolList.some(t => t.name === 'list_directory' || t.name === 'read_file')) {
        console.log("✅ SUCCESS: Found filesystem tools.");
    } else {
        console.error("❌ FAILURE: Did not find expected filesystem tools.");
        process.exit(1);
    }

    console.log("Cleaning up...");
    await mcp.removeServer('test-fs');
    console.log("Test Complete.");
}

runTest().catch(e => {
    console.error("Test Failed:", e);
    process.exit(1);
});
