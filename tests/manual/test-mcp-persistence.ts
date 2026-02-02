import { mcp } from '../src/core/mcp.js';
import fs from 'fs/promises';
import path from 'path';

async function testPersistence() {
    console.log('💾 Testing Connection Persistence...');

    await mcp.init();

    const testServer = 'persistence-test';
    const hangPath = path.join(process.cwd(), 'scripts', 'hang.js');
    const config = { command: 'node', args: [hangPath], autoConnect: false };

    // 1. Add server (autoConnect: false)
    console.log('Adding test server...');
    try { await mcp.addServer(testServer, config, true); } catch (e) { }

    // 2. Connect (manually) - this SHOULD set autoConnect: true
    console.log('Connecting...');
    await mcp.connect(testServer, mcp.getStatus().find(s => s.name === testServer)!.config);

    // 3. Verify on disk
    const configPath = path.join(process.cwd(), '.obsidian', 'mcp.json');
    const content = await fs.readFile(configPath, 'utf-8');
    const data = JSON.parse(content);

    if (data.servers[testServer].autoConnect === true) {
        process.stdout.write('✅ autoConnect saved as TRUE after connect\n');
    } else {
        process.stdout.write('❌ autoConnect failed to save as TRUE\n');
        process.exit(1);
    }

    // 4. Disconnect - this SHOULD set autoConnect: false
    console.log('Disconnecting...');
    await mcp.disconnect(testServer);

    const content2 = await fs.readFile(configPath, 'utf-8');
    const data2 = JSON.parse(content2);

    if (data2.servers[testServer].autoConnect === false) {
        process.stdout.write('✅ autoConnect saved as FALSE after disconnect\n');
    } else {
        process.stdout.write('❌ autoConnect failed to save as FALSE\n');
        process.exit(1);
    }

    // Cleanup
    await mcp.removeServer(testServer);
    console.log('🧹 Cleanup done.');
}

testPersistence().catch(err => {
    console.error(err);
    process.exit(1);
});
