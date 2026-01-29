import React from 'react';
import { Box, Text } from 'ink';

export const COMMANDS = [
    { name: '/init', desc: 'Initialize configuration' },
    { name: '/help', desc: 'Show available commands' },
    { name: '/exit', desc: 'Exit the CLI' },
    { name: '/clear', desc: 'Clear history' },
    { name: '/cost', desc: 'Show session cost' },
    { name: '/usage', desc: 'Show historical usage' },
    { name: '/models', desc: 'Select AI model' },
];

interface CommandPopupProps {
    matches: typeof COMMANDS;
    selectedIndex: number;
}

export const CommandPopup = ({ matches, selectedIndex }: CommandPopupProps) => {
    if (matches.length === 0) return null;

    return (
        <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="gray"
            paddingX={1}
            marginBottom={0}
            width="100%"
        >
            {matches.map((cmd, i) => {
                const isSelected = i === selectedIndex;
                return (
                    <Box key={cmd.name} justifyContent="space-between">
                        <Text color={isSelected ? 'cyan' : 'red'} bold={isSelected}>
                            {isSelected ? '> ' : '  '}
                            {cmd.name}
                        </Text>
                        <Text color={isSelected ? 'white' : 'gray'}>{cmd.desc}</Text>
                    </Box>
                );
            })}
        </Box>
    );
};
