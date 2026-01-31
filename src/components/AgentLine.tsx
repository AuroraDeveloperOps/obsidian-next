import React from 'react';
import { Box, Text } from 'ink';
import { renderMarkdown } from '../utils/syntax.js';

interface AgentLineProps {
    content: string;
    isStreaming?: boolean;
}

<<<<<<< HEAD
const flareAnim = ["·", "▪", "▚", "❖", "✦", "✹", "✦", "▪"];

// Only short messages with these exact patterns trigger animation
const isProcessingMessage = (content: string): boolean => {
    const lower = content.toLowerCase().trim();
    // Only animate for short status messages, not full responses
=======
// Static processing indicator - no animation to prevent flickering
const PROCESSING_INDICATOR = "◆";

// Only short messages with these exact patterns show processing state
const isProcessingMessage = (content: string): boolean => {
    const lower = content.toLowerCase().trim();
    // Only show processing for short status messages, not full responses
>>>>>>> polyoxy-dev/v0.4.0-mcp
    if (content.length > 100) return false;
    // Must end with ... or be a known short status
    return lower.endsWith('...') ||
        lower.startsWith('[safe]') ||
        lower.startsWith('[plan]') ||
        lower.startsWith('[auto]') ||
        lower === 'generating plan...' ||
        lower === 'executing plan...';
};

export const AgentLine: React.FC<AgentLineProps> = ({ content, isStreaming }) => {
    const isProcessing = isStreaming || isProcessingMessage(content);

<<<<<<< HEAD
    const [frame, setFrame] = React.useState(0);

    React.useEffect(() => {
        if (!isProcessing) return;
        const interval = setInterval(() => {
            setFrame((prev) => (prev + 1) % flareAnim.length);
        }, 100);
        return () => clearInterval(interval);
    }, [isProcessing]);

=======
>>>>>>> polyoxy-dev/v0.4.0-mcp
    // Check if content has markdown (code blocks, headers, lists)
    const hasMarkdown = content.includes('```') ||
        content.includes('# ') ||
        content.match(/^\s*[-*]\s/m) ||
        content.includes('`');

    // Render with syntax highlighting if markdown present
    const renderedContent = hasMarkdown && !isProcessing
        ? renderMarkdown(content)
        : content;

    return (
        <Box flexDirection="column" paddingX={1}>
            <Box flexDirection="row">
                <Box marginRight={1}>
                    {isProcessing ? (
<<<<<<< HEAD
                        <Text color="yellow">{flareAnim[frame]}</Text>
=======
                        <Text color="yellow">{PROCESSING_INDICATOR}</Text>
>>>>>>> polyoxy-dev/v0.4.0-mcp
                    ) : (
                        <Text color="cyan">*</Text>
                    )}
                </Box>
                <Box flexGrow={1} flexDirection="column">
                    {renderedContent.split('\n').map((line, i) => (
                        <Text key={i} color={isProcessing ? "gray" : undefined}>
                            {line}
                        </Text>
                    ))}
                </Box>
            </Box>
        </Box>
    );
};
