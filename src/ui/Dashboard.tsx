import React from 'react';
import { Box, Text } from 'ink';

export const Dashboard = () => {
    return (
        <Box borderStyle="classic" borderColor="cyan" flexDirection="column" paddingX={1}>
            <Box justifyContent="space-between">
                <Text bold>Obsidian CLI v0.1.0</Text>
                <Text color="gray">~/obsidian-cli</Text>
            </Box>

            <Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderColor="gray" />

            <Box flexDirection="row" paddingTop={1}>
                {/* Left Column: Welcome & Info + ASCII Cube */}
                <Box flexDirection="column" width="60%">
                    <Text bold color="cyan">Welcome back, User!</Text>
                    <Box height={1} />
                    <Text color="blue">
                        {`      +------+
     /      /|
    +------+ |
    |      | +
    |      |/
    +------+`}
                    </Text>
                    <Box height={1} />
                    <Text>Obsidian CLI · Local Mode</Text>
                </Box>

                {/* Vertical Divider */}
                <Box borderStyle="single" borderTop={false} borderBottom={false} borderLeft={false} borderColor="gray" marginX={1} />

                {/* Right Column: Tips */}
                <Box flexDirection="column" width="40%">
                    <Text bold underline>Tips</Text>
                    <Text>✔ Run <Text color="yellow">/init</Text> to setup</Text>
                    <Text>✔ Use <Text color="yellow">/help</Text> for commands</Text>
                </Box>
            </Box>
        </Box>
    );
};
