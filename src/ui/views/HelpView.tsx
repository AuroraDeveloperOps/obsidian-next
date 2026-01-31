import React from 'react';
import { Box, Text, useInput } from 'ink';
import { COMMANDS } from '../CommandPopup.js';

interface HelpViewProps {
    onClose: () => void;
}

export const HelpView: React.FC<HelpViewProps> = ({ onClose }) => {
    useInput((_, key) => {
        if (key.escape) {
            onClose();
        }
    });

    return (
        <Box flexDirection="column" width="100%" height="100%" paddingX={1} paddingY={0}>
            <Box marginBottom={1}>
                <Text bold color="cyan">[*] Help & Documentation</Text>
            </Box>

            <Box flexDirection="column">
                <Box marginBottom={1}>
                    <Text bold>Available Commands</Text>
                </Box>

                {COMMANDS.map((cmd) => (
                    <Box key={cmd.name} flexDirection="column" marginBottom={1}>
                        <Box>
                            <Text color="green" bold>{cmd.name}</Text>
                        </Box>
                        <Box marginLeft={2}>
                            <Text color="white">{cmd.desc}</Text>
                        </Box>
                    </Box>
                ))}
            </Box>

            <Box marginTop={1} borderStyle="single" borderLeft={false} borderRight={false} borderBottom={false} borderTop={true} borderColor="gray" paddingTop={0}>
                <Text color="gray" dimColor>Esc to close</Text>
            </Box>
        </Box>
    );
};
