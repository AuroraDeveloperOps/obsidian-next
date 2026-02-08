import React, { useState } from 'react';
import { Box, Text } from 'ink';

interface ToolOutputProps {
    tool: string;
    output: string;
    isError?: boolean;
}

const MAX_VISIBLE_LINES = 4;
const MAX_LINE_LENGTH = 120; // Truncate extremely long lines (like base64 data)

/**
 * Truncate a line if it exceeds the maximum allowed length
 */
const truncateLine = (line: string): string => {
    if (line.length <= MAX_LINE_LENGTH) return line;
    const truncatedCount = line.length - MAX_LINE_LENGTH;
    return `${line.slice(0, MAX_LINE_LENGTH)}... [DATA TRUNCATED: ${truncatedCount} chars]`;
};

/**
 * Colorize a line based on content type
 */
const colorizeLine = (line: string, isError: boolean): React.ReactNode => {
    const displayLine = truncateLine(line);
    if (isError) {
        return <Text color="red">{displayLine}</Text>;
    }

    // Diff: added lines
    if (displayLine.match(/^\s*\d+\s*\+/) || (displayLine.startsWith('+') && !displayLine.startsWith('+++'))) {
        return <Text color="green">{displayLine}</Text>;
    }
    // Diff: removed lines
    if (displayLine.match(/^\s*\d+\s*-/) || (displayLine.startsWith('-') && !displayLine.startsWith('---'))) {
        return <Text color="red">{displayLine}</Text>;
    }
    // Diff: hunk header
    if (displayLine.startsWith('@@')) {
        return <Text color="cyan">{displayLine}</Text>;
    }
    // Command output prefix (e.g., "> npm run build")
    if (displayLine.startsWith('>') || displayLine.startsWith('$')) {
        return <Text color="yellow">{displayLine}</Text>;
    }
    // Success indicators
    if (displayLine.includes('success') || displayLine.includes('Success') || displayLine.includes('✓') || displayLine.includes('Build success')) {
        return <Text color="green">{displayLine}</Text>;
    }
    // Warning indicators
    if (displayLine.includes('warning') || displayLine.includes('Warning') || displayLine.includes('WARN')) {
        return <Text color="yellow">{displayLine}</Text>;
    }
    // Error indicators
    if (displayLine.includes('error') || displayLine.includes('Error') || displayLine.includes('ERR') || displayLine.includes('failed')) {
        return <Text color="red">{displayLine}</Text>;
    }
    // File paths
    if (displayLine.match(/^[a-zA-Z].*\.(ts|js|tsx|jsx|json|md|css|html)/) || displayLine.includes('dist/') || displayLine.includes('src/')) {
        return <Text color="cyan">{displayLine}</Text>;
    }
    // Numbers/stats (like "106.56 KB")
    if (displayLine.match(/\d+(\.\d+)?\s*(KB|MB|ms|s)\b/)) {
        return <Text color="magenta">{displayLine}</Text>;
    }

    return <Text color="white">{displayLine}</Text>;
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
