import React, { useEffect } from 'react';
import { Box } from 'ink';

export const FullScreen: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    useEffect(() => {
        // Enter Alternate Screen Buffer
        process.stdout.write('\x1b[?1049h');
        // Clear Screen
        process.stdout.write('\x1b[2J');
        // Move cursor via ANSI to home to be safe (Ink handles this but good for init)
        process.stdout.write('\x1b[H');

        return () => {
            // Exit Alternate Screen Buffer
            process.stdout.write('\x1b[?1049l');
        };
    }, []);

    return (
        <Box width="100%" height="100%" flexDirection="column">
            {children}
        </Box>
    );
};
