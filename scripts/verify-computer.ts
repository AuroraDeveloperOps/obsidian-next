// scripts/verify-computer.ts
import { computer } from '../src/computer/index.js';

async function main() {
    console.log('--- Computer Activity Verification ---');
    console.log(`Platform: ${process.platform}`);

    try {
        console.log('\n[1/3] Testing Screenshot...');
        const screenshot = await computer.takeScreenshot();
        console.log(`✓ Screenshot captured (Base64 length: ${screenshot.length})`);

        console.log('\n[2/3] Testing Mouse Move (Moving to 100, 100)...');
        await computer.mouseMove(100, 100);
        console.log('✓ Mouse moved');

        console.log('\n[3/3] Testing Key Press (Escape)...');
        await computer.pressKey('escape');
        console.log('✓ Escape key pressed');

        console.log('\nVerification complete!');
    } catch (error: any) {
        console.error('\nVerification failed!');
        console.error(`Error: ${error.message}`);
        if (error.name === 'ExecutionError' && error.message.includes('cliclick')) {
            console.log('\nTIP: cliclick is likely missing. Install with: brew install cliclick');
        }
    }
}

main();
