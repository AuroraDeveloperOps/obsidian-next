import React from 'react';
import { Box, Text } from 'ink';

interface AgentLineProps {
    content: string;
}

/**
 * AgentLine Component
 * Renders a "Think" line from the Agent.
 * Visual: * Doing something...
 */
export const AgentLine: React.FC<AgentLineProps> = ({ content }) => {
    return (
        <Box>
            <Text color="gray">
                <Text bold>*</Text> {content}
            </Text>
        </Box>
    );
};
