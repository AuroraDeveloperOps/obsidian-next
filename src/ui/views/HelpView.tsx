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
            {/* Minimal Header */}
            <Box marginBottom={1}>
                <Text bold color="white">[ Help & Documentation ]</Text>
            </Box>

            <Box flexDirection="column">
                <Box marginBottom={1}>
                    <Text bold color="gray">Available Commands</Text>
                </Box>

                {COMMANDS.map((cmd) => (
                    <Box key={cmd.name} flexDirection="row" marginBottom={0}>
                        <Box width={14}>
                            <Text color="red">{cmd.name}</Text>
                        </Box>
                        <Box>
                            <Text color="white">{cmd.desc}</Text>
                        </Box>
                    </Box>
                ))}
            </Box>

            {/* Minimal Footer */}
            <Box marginTop={1}>
                <Text color="gray" dimColor>Esc to close</Text>
            </Box>
        </Box>
    );
};
