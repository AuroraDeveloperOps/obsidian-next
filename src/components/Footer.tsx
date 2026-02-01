import React from 'react';
import { Box, Text } from 'ink';
import { usage } from '../core/usage.js';
import { tasks } from '../core/tasks.js';

interface FooterProps {
    mode: 'auto' | 'plan' | 'safe';
    model: string;
    taskProgress?: string;
}

export const Footer: React.FC<FooterProps> = ({ mode, model, taskProgress }) => {
    // Get real session stats
    const tokens = usage.getSessionTokens();
    // taskProgress is now passed as prop

    // Format tokens: "1.2k"
    const formatK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString();

    return (
        <Box flexDirection="column" paddingX={0} marginBottom={0}>
            {/* Header / Stats Line */}
            <Box flexDirection="row" justifyContent="space-between">
                <Text color="gray">
                    <Text dimColor>Session: {formatK(tokens.input)} in</Text> · <Text dimColor>{formatK(tokens.output)} out</Text>
                </Text>
            </Box>

            {/* Task Summary Line (if active) */}
            {taskProgress && taskProgress !== 'No active task' && (
                <Box flexDirection="row" marginTop={0}>
                    <Text color="cyan">
                        Tasks ({taskProgress.match(/\[(.*?)\]/)?.[1] || '?'} open) · <Text dimColor>ctrl+t to view</Text>
                    </Text>
                </Box>
            )}
        </Box>
    );
};
