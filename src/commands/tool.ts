import { bus } from '../core/bus.js';
import { tools } from '../core/tools.js';
import { CommandHandler } from '../core/commands.js';

/**
 * /tool command - Manually execute tools for testing
 * Usage: /tool <name> <json-args>
 * Example: /tool read {"path": "package.json"}
 */
export const toolCommand: CommandHandler = async (args) => {
    if (args.length === 0) {
        // List available tools
        const toolList = await tools.list();
        const content = [
            'Available Tool Registry',
            ...toolList.map(t => `   ⎿  ${t.name.padEnd(12)} ${t.description}`),
            '',
            '   [Usage]',
            '   ⎿  /tool <name> <json-args>',
            '',
        ].join('\n');

        bus.emitAgent({
            type: 'thought',
            content
        });

        bus.emitAgent({
            type: 'done',
            summary: 'Tools listed'
        });
        return;
    }

    const toolName = args[0];
    const jsonArgs = args.slice(1).join(' ');

    if (!tools.has(toolName)) {
        bus.emitAgent({
            type: 'error',
            message: `Unknown tool: ${toolName}`
        });
        return;
    }

    try {
        // Parse arguments
        const parsedArgs = jsonArgs ? JSON.parse(jsonArgs) : {};

        // Execute tool (this will emit tool_start and tool_result events)
        const result = await tools.execute(toolName, parsedArgs);

        bus.emitAgent({
            type: 'done',
            summary: result.success ? 'Tool executed successfully' : 'Tool execution failed'
        });
    } catch (error: any) {
        bus.emitAgent({
            type: 'error',
            message: `Failed to execute tool: ${error.message}`
        });
    }
};
