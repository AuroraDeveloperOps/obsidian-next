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
                let content = null;

                if (event.type === 'user_input') {
                    content = (
                        <Box key={i} flexDirection="row" paddingX={1} marginBottom={0}>
                            <Text backgroundColor="#222222">
                                <Text color="gray">{' > '}</Text>
                                <Text color="white">{event.content}</Text>
                                <Text>{' '}</Text>
                            </Text>
                        </Box>
                    );
                } else if (event.type === 'thought') {
                    if (event.content.startsWith('Mode:')) return null;
                    if (event.hidden) return null;

                    const isLast = i === visibleEvents.length - 1;
                    content = <AgentLine key={i} content={event.content} isStreaming={isLast} />;
                } else if (event.type === 'tool_start') {
                    let argsSummary = '';
                    try {
                        const args = JSON.parse(event.args);
                        const firstVal = Object.values(args)[0];
                        if (typeof firstVal === 'string') {
                            argsSummary = firstVal.length > 60
                                ? firstVal.slice(0, 60) + '...'
                                : firstVal;
                        }
                    } catch { }

                    content = (
                        <Box key={i}>
                            <Text backgroundColor="#1a1a2e" color="white">
                                ⏺
                            </Text>
                            <Text backgroundColor="#1a1a2e" color="white" bold>{event.tool}</Text>
                            <Text backgroundColor="#1a1a2e" color="gray">({argsSummary.trim()}) </Text>
                        </Box>
                    );
                } else if (event.type === 'tool_result') {
                    content = <ToolOutput key={i} tool={event.tool} output={event.output} isError={event.isError} />;
                } else if (event.type === 'done') {
                    content = (
                        <EphemeralItem delay={5000}>
                            <Text key={i} color="green">[OK] {event.summary}</Text>
                        </EphemeralItem>
                    );
                } else if (event.type === 'error') {
                    content = <Text key={i} color="red">[ERR] {event.message}</Text>;
                } else if (event.type === 'clear_history') {
                    content = (
                        <EphemeralItem delay={3000}>
                            <Text key={i} color="gray">[SYS] History cleared</Text>
                        </EphemeralItem>
                    );
                }

                if (!content) return null;

                return (
                    <Box key={i} marginTop={1}>
                        {content}
                    </Box>
                );
            })}
        </Box>
    );
};
