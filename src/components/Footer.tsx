import React from 'react';
import { Box, Text } from 'ink';
import { usage } from '../core/usage.js';

interface FooterProps {
    mode: 'auto' | 'plan' | 'safe';
    model: string;
    taskProgress?: string;
}

// Mode display config
const MODE_CONFIG = {
    auto: { icon: '▶', color: 'green' as const, label: 'AUTO' },
    plan: { icon: '⏸', color: 'yellow' as const, label: 'PLAN' },
    safe: { icon: '⏺', color: 'red' as const, label: 'SAFE' },
} as const;

export const Footer: React.FC<FooterProps> = ({ mode, model, taskProgress }) => {
    // Get real session stats
    const tokens = usage.getSessionTokens();
    const modeConfig = MODE_CONFIG[mode];

    // Format tokens: "1.2k"
    const formatK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString();

    return (
        <Box flexDirection="column" paddingX={0} marginBottom={0}>
            {/* Header / Stats Line */}
            <Box flexDirection="row" justifyContent="space-between">
                <Box>
                    <Text color={modeConfig.color} bold>
                        {modeConfig.icon} {modeConfig.label}
                    </Text>
                    <Text color="gray"> · </Text>
                    <Text dimColor>
                        {formatK(tokens.input)} in · {formatK(tokens.output)} out
                    </Text>
                </Box>
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
