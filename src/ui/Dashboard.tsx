import React from 'react';
import { Box, Text } from 'ink';

// Minimalist owl in a square frame
const OWL_LOGO = `
+-------+
| o   o |
|   v   |
|  ===  |
+-------+
`;

interface DashboardProps {
    username?: string;
    model?: string;
    workspace?: string;
    showLogo?: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
    username = 'User',
    model = 'Claude Sonnet 4.5',
    workspace = process.cwd(),
    showLogo = false,
}) => {
    // Compact single-line header for most views
    if (!showLogo) {
        return null; // Header is now in Root.tsx
    }

    // Full dashboard with logo (for welcome screen)
    return (
        <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="gray"
            paddingX={2}
            paddingY={1}
        >
            <Box flexDirection="row" justifyContent="space-between">
                {/* Logo */}
                <Box flexDirection="column">
                    <Text color="cyan">{OWL_LOGO}</Text>
                </Box>

                {/* Info */}
                <Box flexDirection="column" marginLeft={2}>
                    <Text color="white" bold>Obsidian Next</Text>
                    <Text color="gray">AI Agent CLI</Text>
                    <Text> </Text>
                    <Text color="gray">Model: <Text color="white">{model}</Text></Text>
                    <Text color="gray">Path:  <Text color="white">{workspace.split('/').pop()}</Text></Text>
                </Box>

                {/* Commands */}
                <Box flexDirection="column" marginLeft={4}>
                    <Text color="gray" bold>Commands</Text>
                    <Text color="gray">/help   - Help</Text>
                    <Text color="gray">/clear  - Clear</Text>
                    <Text color="gray">/models - Models</Text>
                    <Text color="gray">/exit   - Quit</Text>
                </Box>
            </Box>
        </Box>
    );
};
