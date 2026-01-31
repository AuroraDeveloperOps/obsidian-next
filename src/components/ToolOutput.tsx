import React, { useState } from 'react';
import { Box, Text } from 'ink';

interface ToolOutputProps {
    tool: string;
    output: string;
    isError?: boolean;
}

const MAX_VISIBLE_LINES = 4;

/**
 * Colorize a line based on content type
 */
const colorizeLine = (line: string, isError: boolean): React.ReactNode => {
    if (isError) {
        return <Text color="red">{line}</Text>;
    }

    // Diff: added lines
    if (line.match(/^\s*\d+\s*\+/) || (line.startsWith('+') && !line.startsWith('+++'))) {
        return <Text color="green">{line}</Text>;
    }
    // Diff: removed lines
    if (line.match(/^\s*\d+\s*-/) || (line.startsWith('-') && !line.startsWith('---'))) {
        return <Text color="red">{line}</Text>;
    }
    // Diff: hunk header
    if (line.startsWith('@@')) {
        return <Text color="cyan">{line}</Text>;
    }
    // Command output prefix (e.g., "> npm run build")
    if (line.startsWith('>') || line.startsWith('$')) {
        return <Text color="yellow">{line}</Text>;
    }
    // Success indicators
    if (line.includes('success') || line.includes('Success') || line.includes('✓') || line.includes('Build success')) {
        return <Text color="green">{line}</Text>;
    }
    // Warning indicators
    if (line.includes('warning') || line.includes('Warning') || line.includes('WARN')) {
        return <Text color="yellow">{line}</Text>;
    }
    // Error indicators
    if (line.includes('error') || line.includes('Error') || line.includes('ERR') || line.includes('failed')) {
        return <Text color="red">{line}</Text>;
    }
    // File paths
    if (line.match(/^[a-zA-Z].*\.(ts|js|tsx|jsx|json|md|css|html)/) || line.includes('dist/') || line.includes('src/')) {
        return <Text color="cyan">{line}</Text>;
    }
    // Numbers/stats (like "106.56 KB")
    if (line.match(/\d+(\.\d+)?\s*(KB|MB|ms|s)\b/)) {
        return <Text color="magenta">{line}</Text>;
    }

    return <Text color="white">{line}</Text>;
};

export const ToolOutput: React.FC<ToolOutputProps> = ({ tool, output, isError }) => {
    const [expanded, setExpanded] = useState(false);

    const lines = output.split('\n').filter(l => l.trim()); // Remove empty lines
    const needsCollapse = lines.length > MAX_VISIBLE_LINES;
    const visibleLines = expanded ? lines : lines.slice(0, MAX_VISIBLE_LINES);
    const hiddenCount = lines.length - MAX_VISIBLE_LINES;

    return (
        <Box flexDirection="column">
            {/* First line with ⎿ prefix and checkmark */}
            <Box>
                <Text color={isError ? 'red' : 'green'}>{isError ? '  ✗  ' : '  ⎿  '}</Text>
                {colorizeLine(visibleLines[0] || '', isError || false)}
            </Box>

            {/* Additional lines with indentation */}
            {visibleLines.slice(1).map((line, i) => (
                <Box key={i}>
                    <Text>     </Text>
                    {colorizeLine(line, isError || false)}
                </Box>
            ))}

            {/* Collapse indicator */}
            {needsCollapse && !expanded && (
                <Box>
                    <Text color="gray" dimColor>     ... +{hiddenCount} lines</Text>
                </Box>
            )}
        </Box>
    );
};
