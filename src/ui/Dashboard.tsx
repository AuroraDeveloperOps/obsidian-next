import React from 'react';
import { Box, Text } from 'ink';

const OWL_ART = `
    ▄▀▀▀▀▀▄
   █ ◉   ◉ █
   █   ▼   █
    ▀▄▄█▄▄▀
      █ █
     ▀   ▀
`;

interface DashboardProps {
    username?: string;
    model?: string;
    workspace?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({
    username = 'User',
    model = 'Claude Sonnet 4.5',
    workspace = process.cwd(),
}) => {
    return (
        <Box
            borderStyle="round"
            borderColor="red"
            flexDirection="row"
            paddingX={1}
            paddingY={0}
        >
            {/* Left Column: Welcome & Owl */}
            <Box flexDirection="column" width="60%" paddingRight={1}>
                <Box justifyContent="center" marginBottom={1}>
                    <Text bold color="white">Welcome back, {username}!</Text>
                </Box>

                <Box justifyContent="center" marginBottom={1}>
                    <Text color="red">{OWL_ART}</Text>
                </Box>

                <Box flexDirection="column" alignItems="center">
                    <Text color="white">{model} · Obsidian Next</Text>
                    <Text color="gray">{workspace}</Text>
                </Box>
            </Box>

            {/* Vertical Divider */}
            <Box borderStyle="single" borderTop={false} borderBottom={false} borderLeft={false} borderColor="red" marginX={1} />

            {/* Right Column: Commands & Tips */}
            <Box flexDirection="column" width="40%" paddingLeft={1}>
                <Box flexDirection="column" marginBottom={1}>
                    <Text bold color="red">Commands</Text>
                    <Text color="white"><Text bold>/help</Text>  Show all commands</Text>
                    <Text color="white"><Text bold>/tool</Text>  Execute tools</Text>
                    <Text color="white"><Text bold>/clear</Text> Clear history</Text>
                </Box>

                <Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderColor="red" marginBottom={1} />

                <Box flexDirection="column">
                    <Text bold color="red">Quick Start</Text>
                    <Text color="gray">Ask me to read, edit, or</Text>
                    <Text color="gray">run commands in your code.</Text>
                </Box>
            </Box>
        </Box>
    );
};
