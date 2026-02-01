import { bus } from '../core/bus.js';
import { CommandHandler } from '../core/commands.js';
import { usage } from '../core/usage.js';

export const contextCommand: CommandHandler = async (_args) => {
    await usage.init();
    const stats = usage.getStats();
    const sessionCost = usage.getSessionCost();
    const duration = usage.getSessionDuration();

    // Format duration
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const durationStr = minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;

    // High-Fidelity Context Visualization (10x10 Grid)
    const chalk = (await import('chalk')).default;
    const cfg = await (await import('../core/config.js')).config.load();
    const model = cfg.model || 'claude-sonnet-4-5-20250929';
    const ctxUsage = usage.getContextUsage(model);

    // Limits & Blocks
    const LIMIT = ctxUsage.limit;
    const BUFFER_SIZE = LIMIT * 0.1; // 10% buffer
    const USABLE_LIMIT = LIMIT - BUFFER_SIZE;
    const TOTAL_BLOCKS = 100; // 10x10
    const TOKENS_PER_BLOCK = LIMIT / TOTAL_BLOCKS;

    // Categories (Approximated)
    // cached = System Prompt + Tools (usually)
    // active = Messages (user/assistant turns)
    const cachedTokens = ctxUsage.cached;
    const activeTokens = Math.max(0, ctxUsage.used - cachedTokens);
    const freeTokens = Math.max(0, USABLE_LIMIT - ctxUsage.used);
    const bufferTokens = BUFFER_SIZE; // Always exists at end

    // Calculate Blocks
    const cachedBlocks = Math.ceil(cachedTokens / TOKENS_PER_BLOCK);
    const activeBlocks = Math.ceil(activeTokens / TOKENS_PER_BLOCK);
    const bufferBlocks = Math.ceil(bufferTokens / TOKENS_PER_BLOCK);
    // Fill remainder with free blocks, adjusting for rounding errors to keep total 100
    const freeBlocks = Math.max(0, TOTAL_BLOCKS - cachedBlocks - activeBlocks - bufferBlocks);

    // Glyphs
    const G_FILLED = '⛁';
    const G_FREE = '⛶';
    const G_BUFFER = '⛝';

    // Construct Grid Array
    let grid: string[] = [];

    // Fill Grid
    for (let i = 0; i < cachedBlocks; i++) grid.push(chalk.cyan(G_FILLED));
    for (let i = 0; i < activeBlocks; i++) grid.push(chalk.white(G_FILLED));
    for (let i = 0; i < freeBlocks; i++) grid.push(chalk.dim(G_FREE));
    for (let i = 0; i < bufferBlocks; i++) grid.push(chalk.red(G_BUFFER));

    // Ensure strictly 100 blocks, truncating or padding if necessary (though math above should be close)
    if (grid.length > 100) grid = grid.slice(0, 100);
    while (grid.length < 100) grid.push(chalk.red(G_BUFFER));

    // Form Rows (10x10)
    const rows: string[] = [];
    for (let i = 0; i < 10; i++) {
        rows.push('     ' + grid.slice(i * 10, (i + 1) * 10).join(' '));
    }

    // Legend Stats
    const p = (val: number) => (val / LIMIT * 100).toFixed(1) + '%';
    const k = (val: number) => (val / 1000).toFixed(1) + 'k';

    const legend = [
        `   ${chalk.bold('Estimated usage by category')}`,
        `   ${chalk.cyan('⛁ System/Tools:')}  ${k(cachedTokens).padStart(5)} tokens (${p(cachedTokens)})`,
        `   ${chalk.white('⛁ Messages:')}      ${k(activeTokens).padStart(5)} tokens (${p(activeTokens)})`,
        `   ${chalk.dim('⛶ Free space:')}    ${k(freeTokens).padStart(5)} (${p(freeTokens)})`,
        `   ${chalk.red('⛝ Safety Buffer:')} ${k(bufferTokens).padStart(5)} tokens (${p(bufferTokens)})`,
        ``,
        `   ${chalk.bold('Context Usage')}`,
        `   ${chalk.bold(model)} · ${k(ctxUsage.used)}/${k(LIMIT)} tokens (${p(ctxUsage.used)})`,
        ``, // Spacer
        `   ${chalk.gray('Session Cost:')} $${sessionCost.toFixed(4)}`
    ];

    // Combine Grid and Legend
    // Interleave lines
    const outputLines: string[] = [];
    outputLines.push('');
    // First line logic: 
    // The user example shows the model/usage header ABOVE the grid in the request text, but ALSO "Context Usage" header in legend.
    // Let's match the user's example output structure closely:
    // Grid on Left | Legend on Right

    // Top Header
    const headerGrid = grid.slice(0, 10).join(' '); // First row as header example? No, standard grid.
    // Actually user showed:
    // ⛁ ... ⛀   claude...

    // Let's stick to the row-by-row assembly
    for (let i = 0; i < 10; i++) {
        let line = rows[i];
        if (i < legend.length) {
            line += legend[i];
        }
        outputLines.push(line);
    }
    outputLines.push('');

    bus.emitAgent({
        type: 'tool_result',
        tool: 'Context Manager',
        output: outputLines.join('\n')
    });
};
