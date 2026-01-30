import React from 'react';
import { Box, Text } from 'ink';

interface AgentLineProps {
    content: string;
    isStreaming?: boolean;
}

const flareAnim = ["·", "▪", "▚", "❖", "✦", "✹", "✦", "▪"];

// Keywords that indicate active processing
const PROCESSING_KEYWORDS = [
    'processing', 'thinking', 'analyzing', 'generating', 'executing',
    'loading', 'searching', 'reading', 'writing', '...'
];

export const AgentLine: React.FC<AgentLineProps> = ({ content, isStreaming }) => {
    const lower = content.toLowerCase();
    const isProcessing = isStreaming ||
        PROCESSING_KEYWORDS.some(k => lower.includes(k)) ||
        content.endsWith('...');

    const [frame, setFrame] = React.useState(0);

    React.useEffect(() => {
        if (!isProcessing) return;
        const interval = setInterval(() => {
            setFrame((prev) => (prev + 1) % flareAnim.length);
        }, 100);
        return () => clearInterval(interval);
    }, [isProcessing]);

    return (
        <Box flexDirection="row" paddingX={1}>
            <Box marginRight={1}>
                {isProcessing ? (
                    <Text color="yellow">{flareAnim[frame]}</Text>
                ) : (
                    <Text color="cyan">*</Text>
                )}
            </Box>
            <Box flexGrow={1}>
                <Text color={isProcessing ? "gray" : "white"}>
                    {content}
                </Text>
            </Box>
        </Box>
    );
};
