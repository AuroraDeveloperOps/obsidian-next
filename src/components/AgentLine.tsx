import React from 'react';
import { Box, Text } from 'ink';

interface AgentLineProps {
    content: string;
}

export const AgentLine: React.FC<AgentLineProps> = ({ content }) => {
    return (
        <Box>
            <Text color="white">
                <Text bold>*</Text> {content}
            </Text>
        </Box>
    );
};
