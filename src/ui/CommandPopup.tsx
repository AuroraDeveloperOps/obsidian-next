import React from 'react';
import { Box, Text } from 'ink';

export const COMMANDS = [
    { name: '/help', desc: 'Show available commands' },
    { name: '/init', desc: 'Initialize configuration' },
    { name: '/config', desc: 'View/edit configuration' },
    { name: '/models', desc: 'Select AI model' },
    { name: '/mode', desc: 'Set mode (auto/plan/safe)' },
    { name: '/clear', desc: 'Clear conversation' },
    { name: '/cost', desc: 'Show session cost' },
    { name: '/usage', desc: 'Show historical usage' },
    { name: '/status', desc: 'Show system status' },
    { name: '/task', desc: 'View current task' },
    { name: '/tool', desc: 'Execute tools manually' },
    { name: '/sandbox', desc: 'Toggle sandbox mode' },
    { name: '/undo', desc: 'Undo file changes' },
    { name: '/doctor', desc: 'Run diagnostics' },
    { name: '/settings', desc: 'View/edit settings' },
    { name: '/exit', desc: 'Save session and exit' },
    { name: '/resume', desc: 'Restore saved session' },
    { name: '/diff', desc: 'View file changes' },
];

interface CommandPopupProps {
    matches: typeof COMMANDS;
    selectedIndex: number;
}

export const CommandPopup = ({ matches, selectedIndex }: CommandPopupProps) => {
    if (matches.length === 0) return null;

    // Scrolling Window Logic
    const WINDOW_SIZE = 4;
    // Calculate the start index to ensure selectedIndex is always visible
    // If selectedIndex is 0, start is 0
    // If selectedIndex is 3 (4th item), start is 0
    // If selectedIndex is 4 (5th item), start is 1
    let startIndex = 0;
    if (selectedIndex >= WINDOW_SIZE) {
        startIndex = selectedIndex - WINDOW_SIZE + 1;
    }

    // Ensure we don't scroll past the end unnecessarily (though simple offset works too)
    const visibleMatches = matches.slice(startIndex, startIndex + WINDOW_SIZE);

    return (
        <Box
            flexDirection="column"
            paddingX={0}
            marginBottom={0}
            width="100%"
        >

            {visibleMatches.map((cmd, i) => {
                // The actual index in the full list
                const actualIndex = startIndex + i;
                const isSelected = actualIndex === selectedIndex;

                return (
                    <Box key={cmd.name} flexDirection="row">
                        <Box minWidth={12}>
                            <Text
                                color={isSelected ? 'red' : 'gray'}
                            >
                                {isSelected ? '> ' : '  '}
                            </Text>
                            <Text
                                color={isSelected ? 'red' : 'white'}
                                bold={isSelected}
                            >
                                {cmd.name}
                            </Text>
                        </Box>
                        <Text color="gray">  {cmd.desc}</Text>
                    </Box>
                );
            })}

            {startIndex + WINDOW_SIZE < matches.length && (
                <Text color="gray" dimColor>  ↓ ...</Text>
            )}
        </Box>
    );
};
