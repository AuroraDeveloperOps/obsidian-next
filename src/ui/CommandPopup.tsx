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
