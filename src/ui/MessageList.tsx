import React from 'react';
import { Box, Text } from 'ink';
import { AgentEvent } from '../events/types.js';
import { AgentLine } from '../components/AgentLine.js';
import { ToolOutput } from '../components/ToolOutput.js';

interface MessageListProps {
    events: AgentEvent[];
    maxEvents?: number;
}

// Tree connector characters
const TREE = {
    first: '┌─',
    middle: '├─',
    last: '└─',
    single: '──',
    pipe: '│ ',
} as const;

interface ToolGroup {
    tools: Array<{ start: any; result?: any }>;
    startIndex: number;
}

/**
 * Group consecutive tool calls into batches for tree display
 */
function groupToolCalls(events: any[]): Map<number, { position: 'first' | 'middle' | 'last' | 'single'; groupSize: number }> {
    const toolPositions = new Map<number, { position: 'first' | 'middle' | 'last' | 'single'; groupSize: number }>();

    let groupStart = -1;
    let groupIndices: number[] = [];

    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const prevEvent = events[i - 1];
        const nextEvent = events[i + 1];

        if (event.type === 'tool_start') {
            // Check if this starts or continues a group
            const isNewGroup = !prevEvent ||
                (prevEvent.type !== 'tool_start' && prevEvent.type !== 'tool_result');

            if (isNewGroup) {
                // Finalize previous group if any
                if (groupIndices.length > 0) {
                    assignPositions(groupIndices, toolPositions);
                }
                groupIndices = [i];
            } else {
                groupIndices.push(i);
            }
        } else if (event.type !== 'tool_result' && groupIndices.length > 0) {
            // Non-tool event ends the group
            assignPositions(groupIndices, toolPositions);
            groupIndices = [];
        }
    }

    // Finalize last group
    if (groupIndices.length > 0) {
        assignPositions(groupIndices, toolPositions);
    }

    return toolPositions;
}

function assignPositions(indices: number[], positions: Map<number, { position: 'first' | 'middle' | 'last' | 'single'; groupSize: number }>) {
    const size = indices.length;
    indices.forEach((idx, i) => {
        let position: 'first' | 'middle' | 'last' | 'single';
        if (size === 1) {
            position = 'single';
        } else if (i === 0) {
            position = 'first';
        } else if (i === size - 1) {
            position = 'last';
        } else {
            position = 'middle';
        }
        positions.set(idx, { position, groupSize: size });
    });
}

export const MessageList: React.FC<MessageListProps> = ({ events, maxEvents = 50 }) => {
    const visibleEvents = events.slice(-maxEvents);
    const toolPositions = groupToolCalls(visibleEvents);

    return (
        <Box flexDirection="column">
            {visibleEvents.map((event: any, i) => {
                const prevEvent = visibleEvents[i - 1];
                const nextEvent = visibleEvents[i + 1];
                let content = null;

                // Determine spacing
                const isToolGroup = event.type === 'tool_result' && prevEvent?.type === 'tool_start';
                const isActionStart = event.type === 'tool_start' && prevEvent?.type === 'thought';
                const isContinuingToolBatch = event.type === 'tool_start' &&
                    (prevEvent?.type === 'tool_start' || prevEvent?.type === 'tool_result');
                const needsMargin = !isToolGroup && !isActionStart && !isContinuingToolBatch;

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

                    // Get tree position
                    const posInfo = toolPositions.get(i);
                    const position = posInfo?.position || 'single';
                    const connector = position === 'first' ? TREE.first :
                        position === 'middle' ? TREE.middle :
                            position === 'last' ? TREE.last : TREE.single;

                    content = (
                        <Box paddingLeft={2}>
                            <Text color="gray">
                                <Text color="gray" dimColor>{connector}</Text>
                                <Text color="cyan"> ⏺</Text> {event.tool} <Text dimColor>({argsSummary.trim()})</Text>
                            </Text>
                        </Box>
                    );
                } else if (event.type === 'tool_result') {
                    // Check if next event is another tool_start (continuing batch)
                    const hasMoreTools = nextEvent?.type === 'tool_start';
                    const pipePrefix = hasMoreTools ? TREE.pipe : '  ';

                    content = (
                        <Box paddingLeft={4}>
                            <Text color="gray" dimColor>{pipePrefix}</Text>
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
