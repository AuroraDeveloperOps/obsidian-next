import React from 'react';
import { Box, Text } from 'ink';

export const Dashboard = () => {
    return (
        <Box
            borderStyle="round"
            borderColor="red"
            flexDirection="row"
            paddingX={1}
            paddingY={0}
        >
            {/* Left Column: Welcome & Info + Invader */}
            <Box flexDirection="column" width="60%" paddingRight={1}>
                <Box justifyContent="center" marginBottom={1}>
                    <Text bold color="white">Welcome back, User!</Text>
                </Box>

                <Box justifyContent="center" marginBottom={1}>
                    <Text color="red">
                        {`
▀▄   ▄▀
▄█▀███▀█▄
█▀███████▀█
█ █▀▀▀▀▀█ █
   ▀▀ ▀▀
`}
                    </Text>
                </Box>

                <Box flexDirection="column" alignItems="center">
                    <Text color="white">Claude 3.5 Sonnet · Obsidian Pro</Text>
                    <Text color="gray">user@obsidian.local</Text>
                    <Text color="gray">~/obsidian/obsidian-next</Text>
                </Box>
            </Box>

            {/* Vertical Divider */}
            <Box borderStyle="single" borderTop={false} borderBottom={false} borderLeft={false} borderColor="red" marginX={1} />

            {/* Right Column: Tips & Activity */}
            <Box flexDirection="column" width="40%" paddingLeft={1}>
                <Box flexDirection="column" marginBottom={1}>
                    <Text bold color="red">Tips for getting started</Text>
                    <Text color="white">Run <Text bold>/init</Text> to create a config</Text>
                </Box>

                <Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderColor="red" marginBottom={1} />

                <Box flexDirection="column">
                    <Text bold color="red">Recent activity</Text>
                    <Text color="gray">No recent activity</Text>
                </Box>
            </Box>
        </Box>
    );
};
