import React from 'react';
import { Box, Text } from 'ink';

interface DiffLine {
    type: 'add' | 'remove' | 'context';
    content: string;
    lineNumber?: number;
}

interface DiffViewProps {
    filePath: string;
    oldContent: string;
    newContent: string;
    maxLines?: number;
}

/**
 * Compute a simple line-based diff between two strings
 */
function computeDiff(oldContent: string, newContent: string): DiffLine[] {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diff: DiffLine[] = [];

    // Simple diff algorithm - find common prefix/suffix and highlight changes
    let i = 0;
    let j = 0;
    const oldLen = oldLines.length;
    const newLen = newLines.length;

    // Find common prefix
    while (i < oldLen && i < newLen && oldLines[i] === newLines[i]) {
        diff.push({ type: 'context', content: oldLines[i], lineNumber: i + 1 });
        i++;
    }

    // Find common suffix
    let oldEnd = oldLen - 1;
    let newEnd = newLen - 1;
    const suffixLines: DiffLine[] = [];

    while (oldEnd > i && newEnd > i && oldLines[oldEnd] === newLines[newEnd]) {
        suffixLines.unshift({ type: 'context', content: oldLines[oldEnd], lineNumber: oldEnd + 1 });
        oldEnd--;
        newEnd--;
    }

    // Everything in between is changed
    // Add removed lines
    for (j = i; j <= oldEnd; j++) {
        diff.push({ type: 'remove', content: oldLines[j], lineNumber: j + 1 });
    }

    // Add new lines
    for (j = i; j <= newEnd; j++) {
        diff.push({ type: 'add', content: newLines[j], lineNumber: j + 1 });
    }

    // Add suffix
    diff.push(...suffixLines);

    return diff;
}

/**
 * DiffView - Display file changes with syntax highlighting
 *
 * Shows:
 * - Green (+) for additions
 * - Red (-) for deletions
 * - Gray for unchanged context lines
 */
export const DiffView: React.FC<DiffViewProps> = ({
    filePath,
    oldContent,
    newContent,
    maxLines = 20,
}) => {
    const diff = computeDiff(oldContent, newContent);

    // Focus on changed lines with some context
    const changedIndices = diff
        .map((line, idx) => line.type !== 'context' ? idx : -1)
        .filter(idx => idx !== -1);

    if (changedIndices.length === 0) {
        return (
            <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
                <Text color="gray">No changes detected in {filePath}</Text>
            </Box>
        );
    }

    // Get range around changes
    const startIdx = Math.max(0, changedIndices[0] - 2);
    const endIdx = Math.min(diff.length, changedIndices[changedIndices.length - 1] + 3);
    const visibleDiff = diff.slice(startIdx, endIdx);

    // Truncate if too many lines
    const displayLines = visibleDiff.slice(0, maxLines);
    const truncated = visibleDiff.length > maxLines;

    // Count changes
    const additions = diff.filter(l => l.type === 'add').length;
    const deletions = diff.filter(l => l.type === 'remove').length;

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
            {/* Header */}
            <Box marginBottom={1} justifyContent="space-between">
                <Text bold color="blue">{filePath}</Text>
                <Box>
                    <Text color="green">+{additions}</Text>
                    <Text color="gray"> / </Text>
                    <Text color="red">-{deletions}</Text>
                </Box>
            </Box>

            {/* Diff Lines */}
            <Box flexDirection="column">
                {startIdx > 0 && (
                    <Text color="gray" dimColor>  ... ({startIdx} lines above)</Text>
                )}

                {displayLines.map((line, idx) => {
                    const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
                    const color = line.type === 'add' ? 'green' : line.type === 'remove' ? 'red' : 'gray';
                    const lineNum = line.lineNumber ? String(line.lineNumber).padStart(3, ' ') : '   ';

                    return (
                        <Box key={idx}>
                            <Text color="gray" dimColor>{lineNum} </Text>
                            <Text color={color} bold={line.type !== 'context'}>
                                {prefix} {line.content}
                            </Text>
                        </Box>
                    );
                })}

                {truncated && (
                    <Text color="gray" dimColor>  ... ({visibleDiff.length - maxLines} more lines)</Text>
                )}
            </Box>
        </Box>
    );
};

/**
 * Utility to generate a unified diff string
 */
export function generateDiffString(oldContent: string, newContent: string): string {
    const diff = computeDiff(oldContent, newContent);

    return diff.map(line => {
        const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
        return `${prefix} ${line.content}`;
    }).join('\n');
}
