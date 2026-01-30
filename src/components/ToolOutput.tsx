import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface ToolOutputProps {
    tool: string;
    output: string;
    isError?: boolean;
}

const MAX_VISIBLE_LINES = 6;

/**
 * Render output with diff coloring and line numbers for diffs
 */
const renderColoredOutput = (lines: string[], isError: boolean, isDiff: boolean) => {
    if (isError) {
        return lines.map((line, i) => (
            <Text key={i} color="red">{line}</Text>
        ));
    }

    return lines.map((line, i) => {
        // Diff with line numbers
        if (isDiff) {
            // Line number prefix (e.g., "  329 -" or "  329 +")
            const lineNumMatch = line.match(/^(\s*\d+)\s*([+-])?(.*)$/);
            if (lineNumMatch) {
                const [, lineNum, sign, content] = lineNumMatch;
                const color = sign === '+' ? 'green' : sign === '-' ? 'red' : 'white';
                return (
                    <Text key={i}>
                        <Text color="gray">{lineNum} </Text>
                        <Text color={color}>{sign || ' '}</Text>
                        <Text color={color}>{content}</Text>
                    </Text>
                );
            }
            // Regular diff lines
            if (line.startsWith('+') && !line.startsWith('+++')) {
                return <Text key={i} color="green">{line}</Text>;
            }
            if (line.startsWith('-') && !line.startsWith('---')) {
                return <Text key={i} color="red">{line}</Text>;
            }
            if (line.startsWith('@@')) {
                return <Text key={i} color="cyan">{line}</Text>;
            }
        }
        return <Text key={i}>{line}</Text>;
    });
};

export const ToolOutput: React.FC<ToolOutputProps> = ({ tool, output, isError }) => {
    const [expanded, setExpanded] = useState(false);

    const lines = output.split('\n');
    const isDiff = lines.some(l => l.startsWith('+') || l.startsWith('-') || l.match(/^\s*\d+\s*[+-]/));
    const needsCollapse = lines.length > MAX_VISIBLE_LINES;
    const visibleLines = expanded ? lines : lines.slice(0, MAX_VISIBLE_LINES);
    const hiddenCount = lines.length - MAX_VISIBLE_LINES;

    return (
        <Box flexDirection="column">
            {/* Result line with ⎿ prefix */}
            <Box>
                <Text color="gray">  ⎿  </Text>
                <Text color={isError ? 'red' : 'white'}>
                    {visibleLines[0]}
                </Text>
            </Box>

            {/* Additional lines with indentation */}
            {visibleLines.slice(1).map((line, i) => (
                <Box key={i}>
                    <Text color="gray">     </Text>
                    {isDiff ? (
                        (() => {
                            if (line.match(/^\s*\d+\s*\+/)) {
                                return <Text color="green">{line}</Text>;
                            }
                            if (line.match(/^\s*\d+\s*-/)) {
                                return <Text color="red">{line}</Text>;
                            }
                            if (line.startsWith('+')) {
                                return <Text color="green">{line}</Text>;
                            }
                            if (line.startsWith('-')) {
                                return <Text color="red">{line}</Text>;
                            }
                            return <Text>{line}</Text>;
                        })()
                    ) : (
                        <Text color={isError ? 'red' : 'white'}>{line}</Text>
                    )}
                </Box>
            ))}

            {/* Collapse indicator */}
            {needsCollapse && !expanded && (
                <Box>
                    <Text color="gray">     ... +{hiddenCount} lines</Text>
                </Box>
            )}
        </Box>
    );
};
