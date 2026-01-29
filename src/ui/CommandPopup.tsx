import React from 'react';
import { Box, Text } from 'ink';

const COMMANDS = [
    { name: '/init', desc: 'Initialize configuration' },
    { name: '/help', desc: 'Show available commands' },
    { name: '/exit', desc: 'Exit the CLI' },
    { name: '/clear', desc: 'Clear history' },
    { name: '/cost', desc: 'Show session cost' },
    { name: '/usage', desc: 'Show historical usage' },
    { name: '/models', desc: 'Select AI model' },
];

export const CommandPopup = ({ input }: { input: string }) => {
    if (!input.startsWith('/')) return null;

    const query = input.toLowerCase();
    const matches = COMMANDS.filter(c => c.name.startsWith(query));

    if (matches.length === 0) return null;

    return (
        <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="cyan"
            position="absolute"
            marginTop={-matches.length - 2} // Lift above input
            paddingX={1}
            zIndex={1} // Use z-index if supported or just ensuring order
        >
            {matches.map((cmd, i) => (
                <Box key={cmd.name} justifyContent="space-between" width={40}>
                    <Text color="yellow" bold>{cmd.name}</Text>
                    <Text color="gray">{cmd.desc}</Text>
                </Box>
            ))}
        </Box>
    );
};
