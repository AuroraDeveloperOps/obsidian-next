import { mcp } from '../src/core/mcp.js';
import process from 'process';

async function testContext7E2E() {
    process.stderr.write('[INFO] Starting Context7 E2E Test...\n');

    await mcp.init();

    const serverName = 'context7';
    const status = mcp.getStatus().find(s => s.name === serverName);

    if (!status) {
        process.stderr.write('[FAIL] Context7 server not found in configuration.\n');
        process.exit(1);
    }

    if (!status.connected) {
        process.stderr.write(`[CONN] Connecting to ${serverName}...\n`);
        await mcp.connect(serverName, status.config);
    }

    // 1. Resolve Library ID
    process.stderr.write('\n[TEST] Step 1: resolve-library-id...\n');
    let libraryId = '';
    try {
        const resolveResult: any = await mcp.callTool(serverName, 'resolve-library-id', {
            query: 'next.js'
        });

        const content = resolveResult.content?.[0]?.text;
        if (content && !content.includes('MCP error')) {
            const matches = JSON.parse(content);
            libraryId = matches[0].id;
            process.stderr.write(`[PASS] Success! Resolved libraryId: ${libraryId}\n`);
        } else {
            process.stderr.write(`[FAIL] Error in content: ${content}\n`);
            process.exit(1);
        }
    } catch (error) {
        process.stderr.write(`[FAIL] Tool execution failed: ${error}\n`);
        process.exit(1);
    }

    // 2. Query Docs
    process.stderr.write('\n[TEST] Step 2: query-docs...\n');
    try {
        const queryResult: any = await mcp.callTool(serverName, 'query-docs', {
            libraryId: libraryId,
            query: 'server components'
        });

        const text = queryResult.content?.[0]?.text;
        if (text && !text.includes('MCP error')) {
            process.stderr.write(`[PASS] Success! Result Snippet: ${text.substring(0, 200)}...\n`);
        } else {
            process.stderr.write(`[FAIL] Unexpected tool result: ${text}\n`);
            process.exit(1);
        }
    } catch (error) {
        process.stderr.write(`❌ Tool execution failed: ${error}\n`);
        process.exit(1);
    }

    process.stderr.write('\n[DONE] E2E Test Completed Successfully!\n');
}

testContext7E2E().catch(err => {
    process.stderr.write(`Unexpected error: ${err}\n`);
    process.exit(1);
});
