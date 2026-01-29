import React from 'react';
import { Box, Text } from 'ink';

interface AgentLineProps {
    content: string;
    isUser?: boolean;
}

/**
 * Parse and render CLI-formatted text
 * Handles: code blocks, inline code, bold, lists, headers
 */
function renderContent(content: string, isUser: boolean): React.ReactNode[] {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeBlockLang = '';

    lines.forEach((line, lineIndex) => {
        // Code block start/end
        if (line.startsWith('```')) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeBlockLang = line.slice(3).trim();
                codeBlockContent = [];
            } else {
                // End code block - render it
                elements.push(
                    <Box key={`code-${lineIndex}`} flexDirection="column" marginY={0} marginLeft={2}>
                        {codeBlockLang && (
                            <Text color="gray" dimColor>[{codeBlockLang}]</Text>
                        )}
                        <Box borderStyle="single" borderColor="gray" paddingX={1}>
                            <Text color="yellow">
                                {codeBlockContent.join('\n')}
                            </Text>
                        </Box>
                    </Box>
                );
                inCodeBlock = false;
                codeBlockContent = [];
                codeBlockLang = '';
            }
            return;
        }

        if (inCodeBlock) {
            codeBlockContent.push(line);
            return;
        }

        // Empty line
        if (!line.trim()) {
            elements.push(<Text key={`empty-${lineIndex}`}> </Text>);
            return;
        }

        // Headers (# ## ###)
        const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
        if (headerMatch) {
            const level = headerMatch[1].length;
            const text = headerMatch[2];
            elements.push(
                <Text key={`h-${lineIndex}`} color="white" bold={level === 1} underline={level <= 2}>
                    {text}
                </Text>
            );
            return;
        }

        // Bullet lists (- or *)
        const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
        if (bulletMatch) {
            const indent = bulletMatch[1].length;
            const text = bulletMatch[2];
            elements.push(
                <Box key={`li-${lineIndex}`} marginLeft={indent}>
                    <Text color="gray">  - </Text>
                    <Text color={isUser ? 'cyan' : 'white'}>{renderInline(text)}</Text>
                </Box>
            );
            return;
        }

        // Numbered lists
        const numberedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
        if (numberedMatch) {
            const indent = numberedMatch[1].length;
            const num = numberedMatch[2];
            const text = numberedMatch[3];
            elements.push(
                <Box key={`ol-${lineIndex}`} marginLeft={indent}>
                    <Text color="gray">  {num}. </Text>
                    <Text color={isUser ? 'cyan' : 'white'}>{renderInline(text)}</Text>
                </Box>
            );
            return;
        }

        // Regular line with inline formatting
        elements.push(
            <Text key={`line-${lineIndex}`} color={isUser ? 'cyan' : 'white'}>
                {renderInline(line)}
            </Text>
        );
    });

    // Handle unclosed code block
    if (inCodeBlock && codeBlockContent.length > 0) {
        elements.push(
            <Box key="code-unclosed" flexDirection="column" marginLeft={2}>
                <Box borderStyle="single" borderColor="gray" paddingX={1}>
                    <Text color="yellow">{codeBlockContent.join('\n')}</Text>
                </Box>
            </Box>
        );
    }

    return elements;
}

/**
 * Render inline formatting: `code`, **bold**, *italic*
 */
function renderInline(text: string): React.ReactNode {
    // For simplicity, just handle inline code for now
    // More complex parsing would need a proper tokenizer
    const parts = text.split(/(`[^`]+`)/g);

    return parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
            return (
                <Text key={i} color="yellow" backgroundColor="gray">
                    {part.slice(1, -1)}
                </Text>
            );
        }
        return part;
    });
}

export const AgentLine: React.FC<AgentLineProps> = ({ content, isUser = false }) => {
    const prefix = isUser ? '>' : '*';
    const prefixColor = isUser ? 'cyan' : 'gray';

    return (
        <Box flexDirection="column" marginBottom={1}>
            <Box>
                <Text color={prefixColor} bold>{prefix} </Text>
                <Box flexDirection="column">
                    {renderContent(content, isUser)}
                </Box>
            </Box>
        </Box>
    );
};
