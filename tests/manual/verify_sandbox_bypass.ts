import { BashTool } from '../../src/core/tools.js';
import { settings } from '../../src/core/settings.js';

async function test() {
    console.log('--- Sandbox Bypass Verification ---');

    // 1. Setup - Add bypass permission manually for this test
    const command = 'echo "Outside Sandbox" > /tmp/obsidian_test_bypass.txt';
    await settings.addUnsandboxedPermission('bash', command);

    console.log('Executing command with bypass...');
    const result = await BashTool.execute({ command });

    if (result.success) {
        console.log('✅ Success: ' + result.output);
    } else {
        console.error('❌ Failed: ' + result.error);
    }
}

test().catch(console.error);
