import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { bus } from '../core/bus.js';
import { AgentEvent } from '../events/types.js';
import { AgentLine } from '../components/AgentLine.js';
import { ToolOutput } from '../components/ToolOutput.js';
import { Dashboard } from './Dashboard.js';
import { CommandPopup } from './CommandPopup.js';

import { history } from '../core/history.js';
import { usage } from '../core/usage.js';
import { config } from '../core/config.js';

export const Root = () => {
    const [events, setEvents] = useState<AgentEvent[]>([]);
    const [input, setInput] = useState('');
    const { exit } = useApp();

    // State for footer data
    const [stats, setStats] = useState({ cost: 0, model: 'Loading...' });

    // Load initial footer data and subscribe to updates
    useEffect(() => {
        const updateStats = async () => {
            const cfg = await config.load();
            setStats({
                cost: usage.getSessionCost(),
                model: cfg.model
            });
        };

        updateStats();

        const statHandler = (event: AgentEvent) => {
            // Update on relevant events
            if (event.type === 'done' || event.type === 'tool_result' || event.type === 'thought') {
                updateStats();
            }
        };
        bus.on('agent', statHandler);
        return () => {
            bus.off('agent', statHandler);
        };
    }, []);

    // Load history on mount
    useEffect(() => {
        history.load().then(loadedEvents => {
            if (loadedEvents.length > 0) {
                setEvents(loadedEvents);
            }
        });
    }, []);

    // Save history on change
    useEffect(() => {
        if (events.length > 0) {
            history.save(events);
        }
    }, [events]);

    useEffect(() => {
        const handler = (event: AgentEvent) => {
            if (event.type === 'clear_history') {
                setEvents([]);
                history.clear();
                return;
            }

            setEvents(prev => {
                // If it's a thought and the last event was also a thought, UPDATE it for streaming effect
                const last = prev[prev.length - 1];
                if (event.type === 'thought' && last && last.type === 'thought') {
                    const newEvents = [...prev];
                    newEvents[newEvents.length - 1] = event;
                    return newEvents;
                }
                return [...prev, event];
            });
        };

        bus.on('agent', handler);

        return () => {
            bus.off('agent', handler);
        };
    }, []);

    const handleSubmit = (value: string) => {
        if (!value.trim()) return;
        if (value.trim() === '/exit') {
            exit();
            return;
        }
        bus.emitUser({ type: 'user_input', content: value });
        setInput('');
    };

    return (
        <Box flexDirection="column" height="100%">
            {/* Header / Dashboard */}
            <Dashboard />

            {/* Event Stream (Scrollable area) */}
            <Box flexDirection="column" flexGrow={1} marginY={1} overflowY="hidden">
                {events.slice(-5).map((event, i) => { // Tighter slice to leave room
                    if (event.type === 'thought') return <AgentLine key={i} content={event.content} />;
                    if (event.type === 'tool_result') return <ToolOutput key={i} tool={event.tool} output={event.output} isError={event.isError} />;
                    if (event.type === 'done') return <Text key={i} color="green">✔ {event.summary}</Text>;
                    if (event.type === 'error') return <Text key={i} color="red">✖ {event.message}</Text>;
                    if (event.type === 'clear_history') return <Text key={i} color="gray">⟳ History cleared</Text>;
                    return null;
                })}
            </Box>

            {/* Input Area */}
            <Box flexDirection="column">
                <CommandPopup input={input} />
                <Box borderStyle="round" borderColor="gray" paddingX={1}>
                    <Text color="red" bold>❯ </Text>
                    <TextInput
                        value={input}
                        onChange={setInput}
                        onSubmit={handleSubmit}
                        placeholder="Type a command..."
                    />
                </Box>
            </Box>

            {/* Footer / Status Bar - Responsive Flexbox */}
            <Box
                borderStyle="single"
                borderTop={false}
                borderLeft={false}
                borderRight={false}
                borderColor="gray"
                marginTop={0}
                paddingX={1}
                flexDirection="row"
                justifyContent="space-between"
            >
                <Box minWidth={20}>
                    <Text color="gray">[ Context: 0 files ]</Text>
                </Box>

                <Box minWidth={25} justifyContent="center">
                    <Text color="gray">[ Model: <Text color="white">{stats.model}</Text> ]</Text>
                </Box>

                <Box minWidth={15} justifyContent="flex-end">
                    <Text color="gray">[ Cost: <Text color="green">${stats.cost.toFixed(4)}</Text> ]</Text>
                </Box>
            </Box>
        </Box>
    );
};
