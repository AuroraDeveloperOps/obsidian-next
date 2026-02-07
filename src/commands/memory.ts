import { bus } from '../core/bus.js';
import { memory } from '../core/memory.js';
import { CommandHandler } from '../core/commands.js';

export const memoryCommand: CommandHandler = async (args) => {
    const action = args[0] || 'show';

    if (action === 'export') {
        try {
            const path = await memory.exportToMarkdown();
            bus.emitAgent({
                type: 'thought',
                content: `Memory exported to: ${path}`
            });
        } catch (error: any) {
            bus.emitAgent({
                type: 'error',
                message: `Export failed: ${error.message}`
            });
        }
        return;
    }

    // Default: show stats
    const stats = await memory.getStats();
    let content = `Memory Stats: ${stats.total} total items\n`;
    for (const [type, count] of Object.entries(stats.byType)) {
        content += `- ${type}: ${count}\n`;
    }
    content += '\nUse /memory export to save to MEMORY.md';

    bus.emitAgent({
        type: 'thought',
        content
    });
};
