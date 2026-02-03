import React from 'react';
import { Box, Text } from 'ink';

export const COMMANDS = [
    { name: '/help', desc: 'Show available commands', isView: true },
    { name: '/init', desc: 'Initialize configuration', isView: true },
    { name: '/config', desc: 'View/edit configuration', isView: true },
    { name: '/models', desc: 'Select AI model', isView: true },
    { name: '/mode', desc: 'Set mode (auto/plan/safe)', isView: true },
    { name: '/clear', desc: 'Clear conversation' },
    { name: '/context', desc: 'Show context & token usage', isView: true },
    { name: '/status', desc: 'Show system status', isView: true },
    { name: '/task', desc: 'View current task', isView: true },
    { name: '/tool', desc: 'Execute tools manually' },
    { name: '/sandbox', desc: 'Toggle sandbox mode', isView: true },
    { name: '/undo', desc: 'Undo file changes' },
    { name: '/doctor', desc: 'Run diagnostics', isView: true },
    { name: '/settings', desc: 'View/edit settings', isView: true },
    { name: '/exit', desc: 'Save session and exit' },
    { name: '/resume', desc: 'Restore saved session', isView: true },
    { name: '/diff', desc: 'View file changes' },
    { name: '/mcp', desc: 'Manage Model Context Protocol', isView: true },
];

interface CommandPopupProps {
    matches: typeof COMMANDS;
    selectedIndex: number;
}

export const CommandPopup = ({ matches, selectedIndex }: CommandPopupProps) => {
    if (matches.length === 0) return null;

    // Scrolling Window Logic
    const WINDOW_SIZE = 5;
    let startIndex = 0;
    if (selectedIndex >= WINDOW_SIZE) {
        startIndex = selectedIndex - WINDOW_SIZE + 1;
    }

    const visibleMatches = matches.slice(startIndex, startIndex + WINDOW_SIZE);
    const hasMore = startIndex + WINDOW_SIZE < matches.length;
    const hasLess = startIndex > 0;

    return (
        <Box
            flexDirection="column"
            paddingX={0}
            marginTop={0}
            marginBottom={0}
            width="100%"
        >
            {/* Scroll up indicator */}
            {hasLess && (
                <Text color="gray" dimColor>  ↑ {startIndex} more</Text>
            )}

            {visibleMatches.map((cmd, i) => {
                const actualIndex = startIndex + i;
                const isSelected = actualIndex === selectedIndex;

                return (
                    <Box key={cmd.name} flexDirection="row">
                        <Box minWidth={14}>
                            <Text color={isSelected ? 'red' : 'gray'}>
                                {isSelected ? '> ' : '  '}
                            </Text>
                            <Text
                                color={isSelected ? 'red' : 'white'}
                                bold={isSelected}
                            >
                                {cmd.name}
                            </Text>
                        </Box>
                        <Text color="gray">{cmd.desc}</Text>
                    </Box>
                );
            })}

            {/* Scroll down indicator */}
            {hasMore && (
                <Text color="gray" dimColor>  ↓ {matches.length - startIndex - WINDOW_SIZE} more</Text>
            )}

            {/* Navigation hints */}
            <Box marginTop={0}>
                <Text color="gray" dimColor>
                    ↑↓ navigate  Enter execute  Tab complete  Esc cancel
                </Text>
            </Box>
        </Box>
    );
};
