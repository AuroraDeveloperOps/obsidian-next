import React from 'react';
import { Box, Text } from 'ink';

interface ToolOutputProps {
    tool: string;
    output: string;
    isError?: boolean;
}

/**
 * Render output with diff coloring for +/- lines
 */
const renderColoredOutput = (output: string, isError: boolean) => {
    if (isError) {
        return <Text color="red">{output}</Text>;
    }

    const lines = output.split('\n');
    return (
        <Box flexDirection="column">
            {lines.map((line, i) => {
                // Diff coloring
                if (line.startsWith('+') && !line.startsWith('+++')) {
                    return <Text key={i} color="green">{line}</Text>;
                }
                if (line.startsWith('-') && !line.startsWith('---')) {
                    return <Text key={i} color="red">{line}</Text>;
                }
                if (line.startsWith('@@')) {
                    return <Text key={i} color="cyan">{line}</Text>;
                }
                // File path in diffs
                if (line.startsWith('diff ') || line.startsWith('index ')) {
                    return <Text key={i} color="yellow">{line}</Text>;
                }
                return <Text key={i}>{line}</Text>;
            })}
        </Box>
    );
};

export const ToolOutput: React.FC<ToolOutputProps> = ({ tool, output, isError }) => {
    return (
        <Box flexDirection="column" marginLeft={2}>
            <Box>
                <Text color={isError ? 'red' : 'green'}>{isError ? ' x' : ' ✓'} </Text>
                <Text color="gray">{tool}</Text>
            </Box>
            <Box marginLeft={3} flexDirection="column">
                {renderColoredOutput(output, isError || false)}
            </Box>
        </Box>
    );
};
