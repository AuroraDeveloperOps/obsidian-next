import React from 'react';
import { Box, Text } from 'ink';

interface ToolOutputProps {
    tool: string;
    output: string;
    isError?: boolean;
}

export const ToolOutput: React.FC<ToolOutputProps> = ({ tool, output, isError }) => {
    return (
        <Box flexDirection="column" marginLeft={2}>
            <Box>
                <Text backgroundColor="#333333" color="white" bold>
                    {' ●'} {tool} {' '}
                </Text>
            </Box>
            <Box marginLeft={2} borderStyle={undefined}>
                <Text color={isError ? 'red' : 'white'}>
                    {' └ '}{output}
                </Text>
            </Box>
        </Box>
    );
};
