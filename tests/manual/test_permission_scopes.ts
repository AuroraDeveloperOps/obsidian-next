import { settings } from '../../src/core/settings.js';
import { BashTool } from '../../src/core/tools.js';

async function verify() {
    console.log('--- Hybrid Permission Scope Verification ---');

    const command = 'echo "Scope Test"';
    const tool = 'bash';

    // 1. Test Session Approval
    console.log('\n[1] Testing Session Approval (y)');
    await settings.addSessionPermission(tool, command, true);

    let isAllowed = await settings.isAllowed(tool, command);
    console.log('Session Allowed:', isAllowed ? '✅' : '❌');

    let s = await settings.load();
    let isPersistent = s.permissions.allow.some(p => p.includes(command));
    console.log('Persistent Allowed:', isPersistent ? '❌ (Should be false)' : '✅ (Correct: not in settings.json)');

    // 2. Test Persistent Approval
    console.log('\n[2] Testing Persistent Approval (a)');
    await settings.addAllowedPermission(tool, command);

    isAllowed = await settings.isAllowed(tool, command);
    console.log('Allowed after Persistent call:', isAllowed ? '✅' : '❌');

    s = await settings.reload(); // Force disk reload
    isPersistent = s.permissions.allow.some(p => p.includes(command));
    console.log('Persistent Saved to Disk:', isPersistent ? '✅' : '❌');

    // 3. Test Session Denial Overriding Persistent Allow?
    // Deny takes precedence in the check code I wrote.
    console.log('\n[3] Testing Session Denial (n) overriding Persistent');
    await settings.addSessionPermission(tool, command, false);

    const isDenied = await settings.isDenied(tool, command);
    console.log('Session Denied:', isDenied ? '✅' : '❌');

    isAllowed = await settings.isAllowed(tool, command);
    console.log('Is Allowed (Should be true if session allowed, OR follow denies):', isAllowed);

    // 4. Test Session Bypass
    console.log('\n[4] Testing Session Bypass (s)');
    const guiCommand = 'open -a "Mercury"';
    await settings.addSessionPermission(tool, guiCommand, true, true);

    const isUnsandboxed = await settings.isUnsandboxed(tool, guiCommand);
    console.log('Session Unsandboxed:', isUnsandboxed ? '✅' : '❌');

    s = await settings.reload();
    const isPersistentBypass = s.permissions.allowUnsandboxed.some(p => p.includes(guiCommand));
    console.log('Persistent Bypass Saved:', isPersistentBypass ? '❌ (Should be false)' : '✅ (Correct: not in settings.json)');
}

verify().catch(console.error);
