import { mcp } from '../src/core/mcp.js';
import fs from 'fs/promises';
import path from 'path';

async function testConfigLogic() {
    console.log('🚀 Starting MCP Config Logic Test...');

    // 1. Initialize
    await mcp.init();

    const testServer = 'test-config-server';
    const initialConfig = {
        command: 'echo',
        args: ['initial'],
        env: { 'TEST_KEY': 'initial-value' }
    };

    // 2. Add server
    try {
        console.log(`Adding server: ${testServer}`);
        await mcp.addServer(testServer, initialConfig, true); // true = skip connection
    } catch (e) {
        console.log('Server might already exist, attempting update instead...');
    }

    // 3. Update server
    console.log('Updating environment variable...');
    await mcp.updateServer(testServer, {
        env: { 'TEST_KEY': 'updated-value', 'NEW_KEY': 'added-value' }
    });

    // 4. Verify in-memory
    const status = mcp.getStatus().find(s => s.name === testServer);
    console.log('Current in-memory env:', status?.config.env);

    if (status?.config.env?.TEST_KEY === 'updated-value' && status?.config.env?.NEW_KEY === 'added-value') {
        process.stdout.write('✅ In-memory update successful\n');
    } else {
        process.stdout.write('❌ In-memory update failed\n');
        process.exit(1);
    }

    // 5. Verify persistence
    const configPath = path.join(process.cwd(), '.obsidian', 'mcp.json');
    const content = await fs.readFile(configPath, 'utf-8');
    const persisted = JSON.parse(content);
    console.log('Persisted env:', persisted.servers[testServer]?.env);

    if (persisted.servers[testServer]?.env?.TEST_KEY === 'updated-value') {
        process.stdout.write('✅ Persistence verified\n');
    } else {
        process.stdout.write('❌ Persistence failed\n');
        process.exit(1);
    }

    // Clean up
    await mcp.removeServer(testServer);
    console.log('🧹 Cleanup complete.');
}

testConfigLogic().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
