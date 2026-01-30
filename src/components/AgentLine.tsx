import React from 'react';
import { Box, Text } from 'ink';

interface AgentLineProps {
    content: string;
}

const flareAnim = ["·", "▪", "▚", "❖", "✦", "✹", "✦", "▪"];

export const AgentLine: React.FC<AgentLineProps> = ({ content }) => {
    const isThinking = content.startsWith("Thinking");
    const [frame, setFrame] = React.useState(0);

    React.useEffect(() => {
        if (!isThinking) return;
        const interval = setInterval(() => {
            setFrame((prev) => (prev + 1) % flareAnim.length);
        }, 100);
        return () => clearInterval(interval);
    }, [isThinking]);

    return (
        <Box flexDirection="row">
            <Box marginRight={1}>
                {isThinking ? (
                    <Text color="yellow">{flareAnim[frame]}</Text>
                ) : (
                    <Text color="white" bold>*</Text>
                )}
            </Box>
            <Box flexGrow={1}>
                <Text color={isThinking ? "gray" : "white"}>
                    {content}
                </Text>
            </Box>
        </Box>
    );
};
