import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { bus } from '../core/bus.js';
import { AgentEvent } from '../events/types.js';
import { AgentLine } from '../components/AgentLine.js';
import { ToolOutput } from '../components/ToolOutput.js';
import { MorphSpinner } from '../components/MorphSpinner.js';

export const Root = () => {
    const [events, setEvents] = useState<AgentEvent[]>([]);
    const [input, setInput] = useState('');
    const { exit } = useApp();

    useEffect(() => {
        // Subscribe to Agent Events
        const unsubscribe = bus.on('agent', (event) => {
            if (event.type === 'done') {
                // Optional: handle done state
            }
            setEvents(prev => [...prev, event]);
        });

        return () => {
            // Cleanup not strictly necessary in CLI as we exit, but good practice
            // bus.off... (need to implement off in bus if strictly needed)
        };
    }, []);

    const handleSubmit = (value: string) => {
        if (value.trim() === '/exit') {
            exit();
            return;
        }

        // Emit user input to the bus
        bus.emitUser({ type: 'user_input', content: value });
        setInput('');
    };

    return (
        <Box flexDirection="column" padding={1}>
            <Text bold color="cyan">Obsidian Next</Text>
            <Box height={1} />

            {/* Event Stream */}
            <Box flexDirection="column" marginBottom={1}>
                {events.map((event, i) => {
                    if (event.type === 'thought') {
                        return <AgentLine key={i} content={event.content} />;
                    }
                    if (event.type === 'tool_result') {
                        return <ToolOutput key={i} tool={event.tool} output={event.output} isError={event.isError} />;
                    }
                    if (event.type === 'done') {
                        return <Text key={i} color="green">✔ {event.summary}</Text>;
                    }
                    if (event.type === 'error') {
                        return <Text key={i} color="red">✖ {event.message}</Text>;
                    }
                    return null;
                })}
            </Box>

            {/* Input Area */}
            <Box borderStyle="round" borderColor="cyan" paddingX={1}>
                <Text color="cyan">❯ </Text>
                <TextInput
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                    placeholder="Type a command or ask the agent..."
                />
            </Box>
        </Box>
    );
};
