import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { bus } from '../core/bus.js';
import { AgentEvent, Option } from '../events/types.js';
import { AgentLine } from '../components/AgentLine.js';
import { ToolOutput } from '../components/ToolOutput.js';
import { ApprovalPrompt } from '../components/ApprovalPrompt.js';
import { ChoicePrompt } from '../components/ChoicePrompt.js';
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

// Chat message type for better organization
interface ChatMessage {
    id: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    events: AgentEvent[];
}

export const Root = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [currentEvents, setCurrentEvents] = useState<AgentEvent[]>([]);
    const [input, setInput] = useState('');
    const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
    const [isThinking, setIsThinking] = useState(false);
    const { exit } = useApp();
    const { stdout } = useStdout();

    // Calculate available height for chat area
    const terminalHeight = stdout?.rows || 24;
    const chatHeight = Math.max(terminalHeight - 10, 8); // Reserve space for input/footer

    // Scroll position
    const [scrollOffset, setScrollOffset] = useState(0);

    // State for footer data
    const [stats, setStats] = useState({ cost: 0, model: 'Loading...' });

    // Message ID counter
    const messageIdRef = useRef(0);

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
                model: cfg.model || 'claude-sonnet-4-5'
            });
        };

        updateStats();

        const statHandler = (event: AgentEvent) => {
            if (event.type === 'done' || event.type === 'tool_result' || event.type === 'thought') {
                updateStats();
            }
        };
        bus.on('agent', statHandler);
        return () => {
            bus.off('agent', statHandler);
        };
    }, []);

    // Handle agent events
    useEffect(() => {
        const handler = (event: AgentEvent) => {
            if (event.type === 'clear_history') {
                setMessages([]);
                setCurrentEvents([]);
                history.clear();
                setPendingPrompt(null);
                setIsThinking(false);
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

            // Track thinking state
            if (event.type === 'thought') {
                setIsThinking(true);
            }

            // Completion - finalize message
            if (event.type === 'done') {
                setIsThinking(false);
                // Finalize current events into a message
                setCurrentEvents(prev => {
                    if (prev.length > 0) {
                        const lastThought = prev.filter(e => e.type === 'thought').pop();
                        const content = lastThought && 'content' in lastThought ? lastThought.content : '';

                        setMessages(msgs => [...msgs, {
                            id: messageIdRef.current++,
                            role: 'assistant',
                            content,
                            events: prev,
                        }]);
                    }
                    return [];
                });
                return;
            }

            // Accumulate events
            setCurrentEvents(prev => {
                // Update last thought for streaming
                if (event.type === 'thought') {
                    const lastIdx = prev.findLastIndex(e => e.type === 'thought');
                    if (lastIdx >= 0) {
                        const newEvents = [...prev];
                        newEvents[lastIdx] = event;
                        return newEvents;
                    }
                }
                return [...prev, event];
            });
        };

        bus.on('agent', handler);
        return () => {
            bus.off('agent', handler);
        };
    }, []);

    // Scroll handling
    useInput((_, key) => {
        if (key.upArrow && key.shift) {
            setScrollOffset(prev => Math.min(prev + 3, Math.max(0, messages.length - 3)));
        }
        if (key.downArrow && key.shift) {
            setScrollOffset(prev => Math.max(0, prev - 3));
        }
    });

    const [inputKey, setInputKey] = useState(0);

    // Command popup logic
    const [selectedIndex, setSelectedIndex] = useState(0);
    const query = input.toLowerCase();
    const isCommand = input.startsWith('/');
    const matches = isCommand ? COMMANDS.filter(c => c.name.startsWith(query)) : [];

    useEffect(() => {
        setSelectedIndex(0);
    }, [input]);

    useInput((_, key) => {
        if (matches.length === 0) return;

        if (key.upArrow && !key.shift) {
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : matches.length - 1));
        }
        if (key.downArrow && !key.shift) {
            setSelectedIndex(prev => (prev < matches.length - 1 ? prev + 1 : 0));
        }
        if (key.tab) {
            const selected = matches[selectedIndex];
            if (selected && input !== selected.name) {
                setInput(selected.name);
                setInputKey(prev => prev + 1);
            }
        }
    });

    const handleSubmit = (value: string) => {
        if (!value.trim()) return;

        // Handle command completion
        if (matches.length > 0 && value !== matches[selectedIndex]?.name) {
            const selected = matches[selectedIndex];
            if (selected && selected.name.startsWith(value) && selected.name !== value) {
                return;
            }
        }

        if (value.trim() === '/exit') {
            exit();
            return;
        }

        // Add user message
        setMessages(prev => [...prev, {
            id: messageIdRef.current++,
            role: 'user',
            content: value,
            events: [],
        }]);

        // Reset scroll to bottom
        setScrollOffset(0);

        bus.emitUser({ type: 'user_input', content: value });
        setInput('');
    };

    // Calculate visible messages
    const visibleMessages = messages.slice(-(chatHeight + scrollOffset), messages.length - scrollOffset || undefined);

    return (
        <Box flexDirection="column" height={terminalHeight}>
            {/* Header */}
            <Box
                borderStyle="single"
                borderColor="gray"
                paddingX={1}
                justifyContent="space-between"
            >
                <Text color="white" bold>Obsidian Next</Text>
                <Text color="gray">{stats.model}</Text>
                <Text color="green">${stats.cost.toFixed(4)}</Text>
            </Box>

            {/* Chat Area */}
            <Box flexDirection="column" flexGrow={1} paddingX={1} overflowY="hidden">
                {/* Messages */}
                {visibleMessages.map((msg) => (
                    <Box key={msg.id} flexDirection="column" marginBottom={1}>
                        {msg.role === 'user' ? (
                            <AgentLine content={msg.content} isUser={true} />
                        ) : (
                            <>
                                {/* Show tool events first */}
                                {msg.events
                                    .filter(e => e.type === 'tool_start' || e.type === 'tool_result')
                                    .map((event, i) => {
                                        if (event.type === 'tool_start') {
                                            return (
                                                <Box key={`tool-${i}`}>
                                                    <Text color="gray" dimColor>[TOOL] </Text>
                                                    <Text color="magenta">{event.tool}</Text>
                                                </Box>
                                            );
                                        }
                                        if (event.type === 'tool_result') {
                                            return (
                                                <ToolOutput
                                                    key={`result-${i}`}
                                                    tool={event.tool}
                                                    output={event.output}
                                                    isError={event.isError}
                                                />
                                            );
                                        }
                                        return null;
                                    })}
                                {/* Then show assistant response */}
                                {msg.content && <AgentLine content={msg.content} />}
                            </>
                        )}
                        {msg.events.some(e => e.type === 'error') && (
                            <Text color="red">
                                [ERR] {(msg.events.find(e => e.type === 'error') as any)?.message}
                            </Text>
                        )}
                    </Box>
                ))}

                {/* Current streaming response */}
                {currentEvents.length > 0 && (
                    <Box flexDirection="column" marginBottom={1}>
                        {currentEvents
                            .filter(e => e.type === 'tool_start' || e.type === 'tool_result')
                            .map((event, i) => {
                                if (event.type === 'tool_start') {
                                    return (
                                        <Box key={`cur-tool-${i}`}>
                                            <Text color="gray" dimColor>[TOOL] </Text>
                                            <Text color="magenta">{event.tool}</Text>
                                        </Box>
                                    );
                                }
                                if (event.type === 'tool_result') {
                                    return (
                                        <ToolOutput
                                            key={`cur-result-${i}`}
                                            tool={event.tool}
                                            output={event.output}
                                            isError={event.isError}
                                        />
                                    );
                                }
                                return null;
                            })}
                        {currentEvents.filter(e => e.type === 'thought').map((event, i) => (
                            event.type === 'thought' && (
                                <AgentLine key={`thought-${i}`} content={event.content} />
                            )
                        )).pop()}
                        {currentEvents.filter(e => e.type === 'error').map((event, i) => (
                            event.type === 'error' && (
                                <Text key={`err-${i}`} color="red">[ERR] {event.message}</Text>
                            )
                        ))}
                    </Box>
                )}

                {/* Thinking indicator */}
                {isThinking && currentEvents.length === 0 && (
                    <Box>
                        <Text color="gray" dimColor>* Thinking...</Text>
                    </Box>
                )}

                {/* Scroll indicator */}
                {scrollOffset > 0 && (
                    <Box justifyContent="center">
                        <Text color="gray" dimColor>-- {scrollOffset} more below (Shift+Down to scroll) --</Text>
                    </Box>
                )}
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

            {/* Input Area */}
            <Box flexDirection="column">
                <CommandPopup matches={matches} selectedIndex={selectedIndex} />
                <Box borderStyle="round" borderColor={pendingPrompt ? 'gray' : 'cyan'} paddingX={1}>
                    <Text color="cyan" bold>&gt; </Text>
                    <TextInput
                        key={inputKey}
                        value={input}
                        onChange={pendingPrompt ? () => {} : setInput}
                        onSubmit={pendingPrompt ? () => {} : handleSubmit}
                        placeholder={pendingPrompt ? 'Respond to prompt above...' : 'Message...'}
                    />
                </Box>
            </Box>

            {/* Footer hints */}
            <Box paddingX={1}>
                <Text color="gray" dimColor>
                    /help for commands | Shift+Up/Down to scroll | /exit to quit
                </Text>
            </Box>
        </Box>
    );
};
