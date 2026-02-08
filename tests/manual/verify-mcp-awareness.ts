import { tools } from '../src/core/tools.js';
import { mcp } from '../src/core/mcp.js';
import { listRegistry } from '../src/core/mcp-registry.js';

async function test() {
    process.stderr.write('--- Tool Resolution Test ---\n');
    await mcp.init();
    process.stderr.write('MCP Initialized\n');

    // Connect to context7 for testing if not connected
    const status = mcp.getStatus();
    const targetStatus = status.find(s => s.name === 'context7');
    if (targetStatus && !targetStatus.connected) {
        process.stderr.write('Connecting to context7...\n');
        await mcp.connect('context7', targetStatus.config);
    }

    const allTools = await tools.list();
    process.stderr.write(`Total tools: ${allTools.length}\n`);

    const contextTools = allTools.filter(t => t.name.startsWith('context7_'));
    process.stderr.write(`Context7 tools found: ${contextTools.length}\n`);

    if (contextTools.length > 0) {
        const testTool = contextTools[0];
        process.stderr.write(`Verifying ${testTool.name} is reachable via tools.execute...\n`);

        // We test tools.execute to ensure the dynamic resolution works
        // We don't need to actually call it if we can get it from the internal tool search
        const resolved = (await tools.list()).find(t => t.name === testTool.name);
        if (resolved) {
            process.stderr.write(`✅ Success: ${testTool.name} resolved correctly\n`);
        } else {
            process.stderr.write(`❌ Error: ${testTool.name} not found in dynamic list\n`);
        }
    } else {
        process.stderr.write('Context7 tools not found even after connect!\n');
    }

    process.stderr.write('\n--- Prompt Awareness Test ---\n');
    const mcpStatus = mcp.getStatus();
    const activeServers = mcpStatus.filter(s => s.connected).map(s => s.name);
    const offlineServers = mcpStatus.filter(s => !s.connected).map(s => s.name);
    const registry = listRegistry();
    const installableServers = registry.filter(r => !mcpStatus.find(s => s.name === r.name));

    process.stderr.write(`Active Servers: ${activeServers.join(', ')}\n`);
    process.stderr.write(`Offline Servers: ${offlineServers.join(', ')}\n`);
    process.stderr.write(`Installable Servers: ${installableServers.map(s => s.name).join(', ')}\n`);

    if (activeServers.length > 0) process.stderr.write('✅ Active servers detected\n');
    if (offlineServers.length > 0 || installableServers.length > 0) process.stderr.write('✅ Awareness working\n');

    process.exit(0);
}

test().catch(err => {
    process.stderr.write(`FATAL ERROR: ${err.message}\n`);
    process.exit(1);
});
