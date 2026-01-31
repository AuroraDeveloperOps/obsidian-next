import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { usage } from '../../core/usage.js';

interface UsageViewProps {
    onClose: () => void;
}

export const UsageView: React.FC<UsageViewProps> = ({ onClose }) => {
    const [stats, setStats] = useState(usage.getStats());

    // Refresh stats on mount
    useEffect(() => {
        usage.init().then(() => {
            setStats(usage.getStats());
        });
    }, []);

    useInput((_, key) => {
        if (key.escape) {
            onClose();
        }
    });

    const formatCurrency = (amount: number) => {
        return `$${amount.toFixed(4)}`;
    };

    const formatTokens = (count: number) => {
        return new Intl.NumberFormat().format(count);
    };

    return (
        <Box flexDirection="column" width="100%" height="100%" paddingX={1} paddingY={0}>
            {/* Minimal Header */}
            <Box marginBottom={1}>
                <Text bold color="white">[ Session Impact Analysis ]</Text>
            </Box>

            {/* Main Content Area - Borderless */}
            <Box flexDirection="column" paddingX={0}>

                {/* Row 1: High Level Cost */}
                <Box flexDirection="row" justifyContent="flex-start" marginBottom={1}>
                    <Box width={20}>
                        <Text color="gray">Total Session Cost</Text>
                    </Box>
                    <Text color="green" bold>{formatCurrency(stats.totalCost)}</Text>
                </Box>

                {/* Row 2: Token Breakdown */}
                <Box flexDirection="column" marginBottom={1}>
                    <Box flexDirection="row" justifyContent="flex-start">
                        <Box width={20}>
                            <Text color="gray">Input Tokens</Text>
                        </Box>
                        <Text color="white">{formatTokens(stats.totalInputTokens)}</Text>
                    </Box>
                    <Box flexDirection="row" justifyContent="flex-start">
                        <Box width={20}>
                            <Text color="gray">Output Tokens</Text>
                        </Box>
                        <Text color="white">{formatTokens(stats.totalOutputTokens)}</Text>
                    </Box>
                </Box>

                {/* Row 3: Request Count */}
                <Box flexDirection="row" justifyContent="flex-start">
                    <Box width={20}>
                        <Text color="gray">Total Requests</Text>
                    </Box>
                    <Text color="red">{stats.totalRequests}</Text>
                </Box>
            </Box>

            {/* Footer Info & Close */}
            <Box marginTop={1} flexDirection="row" justifyContent="space-between">
                <Text dimColor color="gray">Rate: $3.00/M (In) • $15.00/M (Out)</Text>
                <Text color="gray" dimColor>Esc to close</Text>
            </Box>
        </Box>
    );
};
