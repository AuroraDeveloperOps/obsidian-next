import React from 'react';
import { Box, Text } from 'ink';

interface ToolOutputProps {
    tool: string;
    output: string;
    isError?: boolean;
}

/**
 * Format tool output for CLI display
 * - Truncate long outputs
 * - Show line counts
 * - Color code based on tool type
 */
export const ToolOutput: React.FC<ToolOutputProps> = ({ tool, output, isError }) => {
    const lines = output.split('\n');
    const maxLines = 15;
    const truncated = lines.length > maxLines;
    const displayLines = truncated ? lines.slice(0, maxLines) : lines;

    // Tool-specific colors
    const toolColors: Record<string, string> = {
        bash: 'magenta',
        read: 'blue',
        write: 'green',
        edit: 'yellow',
        list: 'cyan',
        grep: 'blue',
    };

    const toolColor = toolColors[tool] || 'gray';

    return (
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
            {/* Tool header */}
            <Box>
                <Text color={toolColor} dimColor>{'>'} </Text>
                <Text color={toolColor} bold>{tool}</Text>
                {lines.length > 1 && (
                    <Text color="gray" dimColor> ({lines.length} lines)</Text>
                )}
            </Box>

            {/* Output content */}
            <Box flexDirection="column" marginLeft={2}>
                {displayLines.map((line, i) => (
                    <Text key={i} color={isError ? 'red' : 'gray'} dimColor={!isError}>
                        {line}
                    </Text>
                ))}
                {truncated && (
                    <Text color="gray" dimColor>
                        ... ({lines.length - maxLines} more lines)
                    </Text>
                )}
            </Box>
        </Box>
    );
};
