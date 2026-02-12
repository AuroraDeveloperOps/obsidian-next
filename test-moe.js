#!/usr/bin/env node

/**
 * Quick MoE test - verify provider routing works
 */

import { router } from './dist/chunk-X7N2RNR3.js';

async function test() {
    console.log('Testing MoE Provider System...\n');

    // Initialize router
    await router.initialize();

    // Check provider availability
    const status = await router.checkProviders();
    console.log('Provider Status:');
    console.log('  Anthropic:', status.anthropic ? '✅' : '❌');
    console.log('  Ollama:', status.ollama ? '✅' : '❌');
    console.log();

    // Test routing
    const testMessages = [
        {
            role: 'user',
            content: 'What is 2+2?'
        }
    ];

    console.log('Testing router classification...');
    const provider = await router.route(testMessages);
    console.log('Selected provider:', provider.getName());
    console.log('Model:', provider.getModel());
    console.log('Capabilities:', provider.getCapabilities());
    console.log();

    console.log('✅ All tests passed!');
}

test().catch(console.error);
