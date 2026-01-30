import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { bus } from '../core/bus.js';
import { AgentEvent, Option } from '../events/types.js';
import { AgentLine } from '../components/AgentLine.js';
import { ToolOutput } from '../components/ToolOutput.js';
import { ApprovalPrompt } from '../components/ApprovalPrompt.js';
import { ChoicePrompt } from '../components/ChoicePrompt.js';
import { Dashboard } from './Dashboard.js';
import { CommandPopup, COMMANDS } from './CommandPopup.js';

import { history } from '../core/history.js';
import { usage } from '../core/usage.js';
import { config } from '../core/config.js';

// Pending prompt types
interface PendingApproval {
    type: 'approval';
    requestId: string;
    context: string;
    diff?: string;
}

interface PendingChoice {
    type: 'choice';
    question: string;
    options: Option[];
}

type PendingPrompt = PendingApproval | PendingChoice;

export const Root = () => {
    const [events, setEvents] = useState<AgentEvent[]>([]);
    const [input, setInput] = useState('');
    const [scrollOffset, setScrollOffset] = useState(0);
    const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
    const { exit } = useApp();

    // State for footer data
    const [stats, setStats] = useState({ cost: 0, model: 'Loading...' });

    // Handle prompt resolution
    const handlePromptResolve = useCallback(() => {
        setPendingPrompt(null);
    }, []);

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
                setPendingPrompt(null);
                return;
            }

            // Handle interactive prompts
            if (event.type === 'approval_request') {
                setPendingPrompt({
                    type: 'approval',
                    requestId: event.requestId,
                    context: event.context,
                    diff: event.diff,
                });
                return;
            }

            if (event.type === 'choice_request') {
                setPendingPrompt({
                    type: 'choice',
                    question: event.question,
                    options: event.options,
                });
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

    const [inputKey, setInputKey] = useState(0);

    // --------------- POPUP LOGIC START ---------------
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Calculate matches based on current input
    const query = input.toLowerCase();
    const isCommand = input.startsWith('/');
    const matches = isCommand
        ? COMMANDS.filter(c => c.name.startsWith(query))
        : [];

    // Reset selection when input changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [input]);

    useInput((_, key) => {
        if (matches.length === 0) return;

        if (key.upArrow) {
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : matches.length - 1));
        }

        if (key.downArrow) {
            setSelectedIndex(prev => (prev < matches.length - 1 ? prev + 1 : 0));
        }

        // History Scrolling
        if (key.pageUp) {
            setScrollOffset(prev => Math.min(prev + 5, events.length - 1));
        }
        if (key.pageDown) {
            setScrollOffset(prev => Math.max(0, prev - 5));
        }

        if (key.return || key.tab) {
            // Handle Selection
            const selected = matches[selectedIndex];
            // If we have a match, and the input isn't ALREADY the full command
            if (selected && input !== selected.name) {
                setInput(selected.name);
                setInputKey(prev => prev + 1); // Force remount to fix cursor position
            }
        }
    });
    // --------------- POPUP LOGIC END ---------------

    const handleSubmit = (value: string) => {
        if (!value.trim()) return;

        // RACE CONDITION FIX with Debugging
        if (matches.length > 0 && value !== matches[selectedIndex]?.name) {
            const selected = matches[selectedIndex];
            if (selected && selected.name.startsWith(value) && selected.name !== value) {
                // Debugging why send fails - but blocking partial submission is intended.
                return;
            }
        }

        if (value.trim() === '/exit') {
            exit();
            return;
        }
        bus.emitUser({ type: 'user_input', content: value });
        setInput('');
        // inputKey doesn't need reset, cursor at 0 is fine.
    };

    return (
        <Box flexDirection="column" height="100%">
            {/* Header / Dashboard */}
            <Dashboard />

            {/* Event Stream (Scrollable area) */}
            <Box flexDirection="column" flexGrow={1} marginY={1} overflowY="hidden" justifyContent="flex-end">
                {/* Scroll Indicator */}
                {scrollOffset > 0 && (
                    <Box justifyContent="center" marginBottom={0}>
                        <Text color="gray">--- History ({scrollOffset} lines up) ---</Text>
                    </Box>
                )}

                {/* Render events with scrolling window */}
                {events.slice(Math.max(0, events.length - 50 - scrollOffset), events.length - scrollOffset).map((event, i) => {
                    let content = null;

                    if (event.type === 'thought') {
                        content = <AgentLine key={i} content={event.content} />;
                    } else if (event.type === 'tool_start') {
                        content = (
                            <Box key={i}>
                                <Text color="cyan">[TOOL] </Text>
                                <Text color="white" bold>{event.tool}</Text>
                                <Text color="gray"> {event.args.length > 50 ? event.args.slice(0, 50) + '...' : event.args}</Text>
                            </Box>
                        );
                    } else if (event.type === 'tool_result') {
                        content = <ToolOutput key={i} tool={event.tool} output={event.output} isError={event.isError} />;
                    } else if (event.type === 'done') {
                        content = <Text key={i} color="green">[OK] {event.summary}</Text>;
                    } else if (event.type === 'error') {
                        content = <Text key={i} color="red">[ERR] {event.message}</Text>;
                    } else if (event.type === 'clear_history') {
                        content = <Text key={i} color="gray">[SYS] History cleared</Text>;
                    }

                    if (!content) return null;

                    return (
                        <Box key={i} marginTop={1}>
                            {content}
                        </Box>
                    );
                })}
            </Box>

            {/* Interactive Prompts */}
            {pendingPrompt?.type === 'approval' && (
                <ApprovalPrompt
                    requestId={pendingPrompt.requestId}
                    context={pendingPrompt.context}
                    diff={pendingPrompt.diff}
                    onResolve={handlePromptResolve}
                />
            )}
            {pendingPrompt?.type === 'choice' && (
                <ChoicePrompt
                    question={pendingPrompt.question}
                    options={pendingPrompt.options}
                    onResolve={handlePromptResolve}
                />
            )}

            {/* Input Area (disabled when prompt is active) */}
            <Box flexDirection="column">
                <CommandPopup
                    matches={matches}
                    selectedIndex={selectedIndex}
                />
                <Box borderStyle="round" borderColor={pendingPrompt ? 'gray' : 'gray'} paddingX={1}>
                    <Text color="red" bold>&gt; </Text>
                    <TextInput
                        key={inputKey}
                        value={input}
                        onChange={pendingPrompt ? () => { } : setInput}
                        onSubmit={pendingPrompt ? () => { } : handleSubmit}
                        placeholder={pendingPrompt ? 'Respond to prompt above...' : 'Type a message or command...'}
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
