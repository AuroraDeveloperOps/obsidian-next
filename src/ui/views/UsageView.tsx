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
            {/* Header */}
            <Box marginBottom={1}>
                <Text bold color="cyan">[*] Session Impact Analysis</Text>
            </Box>

            {/* Main Content Area - Single Compact Box */}
            <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={0}>

                {/* Row 1: High Level Cost */}
                <Box flexDirection="row" justifyContent="space-between" paddingX={1} paddingTop={1} paddingBottom={0}>
                    <Text color="white" bold>Total Session Cost</Text>
                    <Text color="green" bold>{formatCurrency(stats.totalCost)}</Text>
                </Box>

                {/* Divider */}
                <Box marginY={0} borderStyle="single" borderLeft={false} borderRight={false} borderTop={false} borderBottom={true} borderColor="gray" />

                {/* Row 2: Token Breakdown */}
                <Box flexDirection="column" paddingX={1} paddingY={0}>
                    <Box flexDirection="row" justifyContent="space-between">
                        <Text color="gray">Input Tokens</Text>
                        <Text color="white">{formatTokens(stats.totalInputTokens)}</Text>
                    </Box>
                    <Box flexDirection="row" justifyContent="space-between">
                        <Text color="gray">Output Tokens</Text>
                        <Text color="white">{formatTokens(stats.totalOutputTokens)}</Text>
                    </Box>
                </Box>

                {/* Divider */}
                <Box marginY={0} borderStyle="single" borderLeft={false} borderRight={false} borderTop={false} borderBottom={true} borderColor="gray" />

                {/* Row 3: Request Count */}
                <Box flexDirection="row" justifyContent="space-between" paddingX={1} paddingBottom={1} paddingTop={0}>
                    <Text color="gray">Total Requests</Text>
                    <Text color="cyan">{stats.totalRequests}</Text>
                </Box>
            </Box>

            {/* Footer Info & Close */}
            <Box marginTop={1} borderStyle="single" borderLeft={false} borderRight={false} borderBottom={false} borderTop={true} borderColor="gray" paddingTop={0} flexDirection="row" justifyContent="space-between">
                <Text dimColor>Rate: $3.00/M (In) • $15.00/M (Out)</Text>
                <Text color="gray" dimColor>Esc to close</Text>
            </Box>
        </Box>
    );
};
