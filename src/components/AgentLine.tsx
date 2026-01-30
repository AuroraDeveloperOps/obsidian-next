import React from 'react';
import { Box, Text } from 'ink';

interface AgentLineProps {
    content: string;
}

export const AgentLine: React.FC<AgentLineProps> = ({ content }) => {
    return (
        <Box flexDirection="row">
            <Box marginRight={1}>
                <Text color="white" bold>*</Text>
            </Box>
            <Box flexGrow={1}>
                <Text color="white">
                    {content}
                </Text>
            </Box>
        </Box>
    );
};
