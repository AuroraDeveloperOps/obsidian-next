import React from 'react';
import { Box, Text } from 'ink';
import { renderMarkdown } from '../utils/syntax.js';
import { Glitter } from './Glitter.js';

interface AgentLineProps {
    content: string;
    isStreaming?: boolean;
}

// Only short messages with these exact patterns show processing state
const isProcessingMessage = (content: string): boolean => {
    const lower = content.toLowerCase().trim();
    // Only show processing for short status messages, not full responses
    if (content.length > 100) return false;
    // Must end with ... or be a known short status
    return lower.endsWith('...') ||
        lower.startsWith('[safe]') ||
        lower.startsWith('[plan]') ||
        lower.startsWith('[auto]') ||
        lower.startsWith('[sandbox]') ||
        lower.includes('thinking') ||
        lower === 'generating plan...' ||
        lower === 'executing plan...';
};

export const AgentLine: React.FC<AgentLineProps> = ({ content, isStreaming }) => {
    // Only show glitter if it is actively streaming. 
    // Static messages that look like status updates should NOT glitter forever.
    const isProcessing = isStreaming && isProcessingMessage(content);

    // If it's the very last event (isStreaming=true), we show the glitter regardless of content?
    // Actually, usually we want glitter IF it's streaming AND it's a thought.
    // But `AgentLine` is only used for thoughts in Root.tsx.

    // However, if the content is just "Thinking...", we want to show it.
    // If the content is a full markdown response, we probably DON'T want glitter even if streaming?
    // No, usually we do want to show activity.

    // Let's refine:
    // 1. If streaming, show glitter.
    // 2. UNLESS it's a long streaming response? No, long responses usually stream token by token.

    // The issue reported is "glitch stops correctly".
    // Previously: const isProcessing = isStreaming || isProcessingMessage(content);
    // This meant if content was "thinking..." it would ALWAYS process, even if isStreaming was false.
    // FIX: strict reliance on isStreaming.

    const showGlitter = isStreaming;

    // Check if content has markdown (code blocks, headers, lists)
    const hasMarkdown = content.includes('```') ||
        content.includes('# ') ||
        content.match(/^\s*[-*]\s/m) ||
        content.includes('`') ||
        content.includes('**') ||
        content.includes('__') ||
        (content.includes('*') && content.split('*').length > 2); // Simple heuristic for italics

    // Render with syntax highlighting if markdown present
    const renderedContent = hasMarkdown && !isProcessing
        ? renderMarkdown(content)
        : content;

    return (
        <Box flexDirection="column" paddingX={1}>
            <Box flexDirection="row">
                <Box marginRight={1}>
                    <Text color="white">●</Text>
                </Box>
                <Box flexGrow={1} flexDirection="column">
                    {renderedContent.split('\n').map((line, i) => (
                        <Text key={i} color={showGlitter ? "gray" : "white"}>
                            {line || ' '}
                        </Text>
                    ))}
                </Box>
            </Box>
        </Box>
    );
};
