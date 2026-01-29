import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { bus } from '../core/bus.js';
import { AgentEvent } from '../events/types.js';
import { AgentLine } from '../components/AgentLine.js';
import { ToolOutput } from '../components/ToolOutput.js';
import { Dashboard } from './Dashboard.js';
import { CommandPopup } from './CommandPopup.js';

export const Root = () => {
    const [events, setEvents] = useState<AgentEvent[]>([]);
    const [input, setInput] = useState('');
    const { exit } = useApp();

    useEffect(() => {
        // Subscribe to Agent Events
        const unsubscribe = bus.on('agent', (event) => {
            setEvents(prev => [...prev, event]);
        });
        return () => { };
    }, []);

    const handleSubmit = (value: string) => {
        if (value.trim() === '/exit') {
            exit();
            return;
        }
        bus.emitUser({ type: 'user_input', content: value });
        setInput('');
    };

    return (
        <Box flexDirection="column" padding={1}>
            {/* Header / Dashboard - ALWAYS SHOW FOR DEBUG */}
            <Dashboard />

            {/* Event Stream (Scrollable area simulation) */}
            <Box flexDirection="column" marginBottom={1} marginTop={1}>
                {events.map((event, i) => {
                    if (event.type === 'thought') return <AgentLine key={i} content={event.content} />;
                    if (event.type === 'tool_result') return <ToolOutput key={i} tool={event.tool} output={event.output} isError={event.isError} />;
                    if (event.type === 'done') return <Text key={i} color="green">✔ {event.summary}</Text>;
                    if (event.type === 'error') return <Text key={i} color="red">✖ {event.message}</Text>;
                    return null;
                })}
            </Box>

            {/* Input Area */}
            <Box flexDirection="column">
                <CommandPopup input={input} />
                <Box borderStyle="classic" borderColor="cyan" paddingX={1}>
                    <Text color="cyan">❯ </Text>
                    <TextInput
                        value={input}
                        onChange={setInput}
                        onSubmit={handleSubmit}
                        placeholder="Type a command..."
                    />
                </Box>
            </Box>

            {/* Footer / Status Bar */}
            <Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderColor="gray" marginTop={0} paddingX={1}>
                <Text color="gray">[ Context: 0 files ] [ Model: Claude 3.5 Sonnet ] [ Cost: $0.00 ]</Text>
            </Box>
        </Box>
    );
};
