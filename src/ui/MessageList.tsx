import React from 'react';
import { Box, Text } from 'ink';
import { AgentEvent } from '../events/types.js';
import { AgentLine } from '../components/AgentLine.js';
import { ToolOutput } from '../components/ToolOutput.js';
import { EphemeralItem } from '../components/EphemeralItem.js';

interface MessageListProps {
    events: AgentEvent[];
    maxEvents?: number;
}

export const MessageList: React.FC<MessageListProps> = ({ events, maxEvents = 50 }) => {
    const visibleEvents = events.slice(-maxEvents);

    return (
        <Box flexDirection="column">
            {visibleEvents.map((event: any, i) => {
                const prevEvent = visibleEvents[i - 1];
                let content = null;

                // Determine spacing: no margin between tool_start and tool_result,
                // or between thought and tool_start (same action group)
                const isToolGroup = event.type === 'tool_result' && prevEvent?.type === 'tool_start';
                const isActionStart = event.type === 'tool_start' && prevEvent?.type === 'thought';
                const needsMargin = !isToolGroup && !isActionStart;

                if (event.type === 'user_input') {
                    content = (
                        <Box flexDirection="column">
                            <Text color="white">
                                <Text color="cyan" bold>{`> `}</Text>
                                {event.content}
                            </Text>
                        </Box>
                    );
                } else if (event.type === 'thought') {
                    if (event.content.startsWith('Mode:')) return null;
                    if (event.hidden) return null;

                    const isLast = i === visibleEvents.length - 1;
                    content = (
                        <Box flexDirection="column">
                            <AgentLine content={event.content} isStreaming={isLast} />
                        </Box>
                    );
                } else if (event.type === 'tool_start') {
                    let argsSummary = '';
                    try {
                        const args = JSON.parse(event.args);
                        const firstVal = Object.values(args)[0];
                        if (typeof firstVal === 'string') {
                            argsSummary = firstVal.length > 40
                                ? firstVal.slice(0, 40) + '...'
                                : firstVal;
                        }
                    } catch { }

                    content = (
                        <Box paddingLeft={2}>
                            <Text color="gray">
                                <Text color="cyan">⏺</Text> {event.tool} <Text dimColor>({argsSummary.trim()})</Text>
                            </Text>
                        </Box>
                    );
                } else if (event.type === 'tool_result') {
                    content = (
                        <Box paddingLeft={4}>
                            <ToolOutput tool={event.tool} output={event.output} isError={event.isError} />
                        </Box>
                    );
                } else if (event.type === 'done') {
                    content = (
                        <Box>
                            <Text color="green">✔ {event.summary}</Text>
                        </Box>
                    );
                } else if (event.type === 'error') {
                    content = (
                        <Box>
                            <Text color="red">[ERR] {event.message}</Text>
                        </Box>
                    );
                }

                if (!content) return null;

                return (
                    <Box key={i} marginTop={needsMargin ? 1 : 0} flexDirection="column">
                        {content}
                    </Box>
                );
            })}
        </Box>
    );
};
