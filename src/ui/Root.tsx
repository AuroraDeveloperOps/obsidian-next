import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { bus } from '../core/bus.js';
import { AgentEvent, Option } from '../events/types.js';
import { AgentLine } from '../components/AgentLine.js';
import { Glitter } from '../components/Glitter.js';
import { ToolOutput } from '../components/ToolOutput.js';
import { ApprovalPrompt } from '../components/ApprovalPrompt.js';
import { ChoicePrompt } from '../components/ChoicePrompt.js';
import { TextInputPrompt } from '../components/TextInputPrompt.js';
import { Dashboard } from './Dashboard.js';
import { CommandPopup, COMMANDS } from './CommandPopup.js';
import { EphemeralItem } from '../components/EphemeralItem.js';
import { Footer } from '../components/Footer.js';
import { DoctorView } from './views/DoctorView.js';
import { HelpView } from './views/HelpView.js';
import { UsageView } from './views/UsageView.js';
import { TaskView } from './views/TaskView.js';
import { SettingsMenu, MenuView } from '../components/SettingsMenu.js';

import { history } from '../core/history.js';
import { usage } from '../core/usage.js';
import { config } from '../core/config.js';
import { context } from '../core/context.js';
import { agent } from '../core/agent.js';
import { highlightJson } from '../utils/highlight.js';

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

interface PendingTextInput {
    type: 'text_input';
    requestId: string;
    prompt: string;
    masked?: boolean;
    placeholder?: string;
}

type PendingPrompt = PendingApproval | PendingChoice | PendingTextInput;

// How many events to show
const MAX_EVENTS = 50;

export const Root = () => {
    const [events, setEvents] = useState<AgentEvent[]>([]);
    const [input, setInput] = useState('');
    const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
    const { exit } = useApp();

    // State for footer data
    const [stats, setStats] = useState({ cost: 0, model: 'Loading...', mode: 'safe' as 'auto' | 'plan' | 'safe' });

    // Active View State Machine
    type ActiveView = 'chat' | 'settings' | 'doctor' | 'help' | 'usage' | 'task';
    const [activeView, setActiveView] = useState<ActiveView>('chat');
    const [settingsTab, setSettingsTab] = useState<MenuView | undefined>();

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
                model: cfg.model,
                mode: context.getMode()
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

            // Handle shutdown - exit after rendering final messages
            if (event.type === 'shutdown_complete') {
                // Delay exit to allow final render
                setTimeout(() => {
                    exit();
                }, 200);
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

            if (event.type === 'text_input_request') {
                setPendingPrompt({
                    type: 'text_input',
                    requestId: event.requestId,
                    prompt: event.prompt,
                    masked: event.masked,
                    placeholder: event.placeholder,
                });
                return;
            }

            setEvents(prev => {
                // If it's a thought and the last event was also a thought, UPDATE it for streaming effect
                const last = prev[prev.length - 1];
                if (event.type === 'thought' && last && last.type === 'thought') {
                    // Avoid unnecessary re-renders if content hasn't meaningfully changed
                    if (last.content === event.content) return prev;
                    const newEvents = [...prev];
                    newEvents[newEvents.length - 1] = event;
                    return newEvents;
                }
                return [...prev, event];
            });
        };

        const userHandler = (event: any) => {
            if (event.type === 'user_input') {
                setEvents(prev => [...prev, { type: 'user_input', content: event.content } as any]);
            }
        };

        bus.on('agent', handler);
        bus.on('user', userHandler);

        return () => {
            bus.off('agent', handler);
            bus.off('user', userHandler);
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

    // Mode cycling function
    const cycleMode = useCallback(async () => {
        const modes: Array<'auto' | 'plan' | 'safe'> = ['auto', 'plan', 'safe'];
        const currentIndex = modes.indexOf(stats.mode);
        const nextMode = modes[(currentIndex + 1) % modes.length];
        await agent.setMode(nextMode);
        setStats(prev => ({ ...prev, mode: nextMode }));
    }, [stats.mode]);

    useInput((input, key) => {
        // Graceful Exit - Ctrl+C
        if (input === '\x03' || (key.ctrl && input === 'c')) {
            // Prevent multiple triggers
            if (activeView === 'chat' && pendingPrompt === null) {
                bus.emitAgent({
                    type: 'thought',
                    content: 'Shutting down gracefully...',
                });

                // Save history explicitly
                history.save(events).then(() => {
                    bus.emitAgent({
                        type: 'clear_history', // Hack to trigger ephemeral message
                    });

                    setTimeout(() => {
                        exit();
                    }, 800);
                });
            } else {
                // Force exit if stuck or in other views
                exit();
            }
            return;
        }

        // Mode Toggle - Shift+Tab
        if (key.shift && key.tab) {
            cycleMode();
            return;
        }

        if (matches.length === 0) return;

        if (key.upArrow) {
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : matches.length - 1));
        }

        if (key.downArrow) {
            setSelectedIndex(prev => (prev < matches.length - 1 ? prev + 1 : 0));
        }

        if (key.return || key.tab) {
            // Handle Selection
            const selected = matches[selectedIndex];

            if (selected) {
                // Determine if we should execute immediately (Enter) or just autofill (Tab)
                // User requested "straight tap" -> Instant execution on Enter
                if (key.return) {
                    setInput(selected.name);
                    handleSubmit(selected.name);
                    return;
                }

                // For Tab, just autofill and let user edit if needed
                if (input !== selected.name) {
                    setInput(selected.name);
                    setInputKey(prev => prev + 1); // Force remount to fix cursor position
                }
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

        // View Route Handlers
        if (value.trim() === '/settings') {
            setSettingsTab(undefined);
            setActiveView('settings');
            setInput('');
            return;
        }
        if (value.trim() === '/doctor') {
            setActiveView('doctor');
            setInput('');
            return;
        }
        if (value.trim() === '/help') {
            setActiveView('help');
            setInput('');
            return;
        }
        if (value.trim() === '/usage' || value.trim() === '/cost') {
            setActiveView('usage');
            setInput('');
            return;
        }
        if (value.trim() === '/task') {
            setActiveView('task');
            setInput('');
            return;
        }
        if (value.trim() === '/sandbox') {
            setSettingsTab('security');
            setActiveView('settings');
            setInput('');
            return;
        }
        if (value.trim() === '/mode') {
            setSettingsTab('mode');
            setActiveView('settings');
            setInput('');
            return;
        }
        if (value.trim() === '/models') {
            setSettingsTab('ui'); // Assuming models might be here or just general config, actually let's use 'categories' if no specific tab matches
            setActiveView('settings');
            setInput('');
            return;
        }
        if (value.trim() === '/config') {
            setSettingsTab('categories');
            setActiveView('settings');
            setInput('');
            return;
        }

        bus.emitUser({ type: 'user_input', content: value });
        setInput('');
    };

    return (
        <Box flexDirection="column" height="100%">
            {/* Header / Dashboard - Fixed Height */}
            <Box flexShrink={0}>
                <Dashboard />
            </Box>

            {/* Active View Area */}
            <Box flexDirection="column" flexGrow={1} overflowY="hidden" justifyContent={activeView !== 'chat' ? "flex-start" : "flex-end"} marginY={1}>
                {activeView === 'settings' ? (
                    <SettingsMenu initialTab={settingsTab} onClose={() => setActiveView('chat')} />
                ) : activeView === 'doctor' ? (
                    <DoctorView onClose={() => setActiveView('chat')} />
                ) : activeView === 'help' ? (
                    <HelpView onClose={() => setActiveView('chat')} />
                ) : activeView === 'usage' ? (
                    <UsageView onClose={() => setActiveView('chat')} />
                ) : activeView === 'task' ? (
                    <TaskView onClose={() => setActiveView('chat')} />
                ) : (
                    events.slice(-MAX_EVENTS).map((event: any, i) => {
                        let content = null;
                        // ... (keep mapping logic)
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
                            // Filter out "Mode: ..." thoughts as they are now shown in the UI
                            if (event.content.startsWith('Mode:')) return null;
                            if (event.hidden) return null;

                            // Check if this is the latest event and if we should consider it streaming
                            // Since we don't track 'isAgentBusy' globally here easily, we assume the LAST thought
                            // in the list is streaming if it hasn't been followed by a result/error/done event.
                            // But actually, the events list updates as we go.
                            // A simple heuristic: if it's the very last event in the list, it might be streaming.
                            const isLast = i === events.slice(-MAX_EVENTS).length - 1;
                            content = <AgentLine key={i} content={event.content} isStreaming={isLast} />;
                        } else if (event.type === 'tool_start') {
                            // Format: ⏺ ToolName(args summary) with background
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

                            // Check if this tool is the latest event (active)
                            const isLast = i === events.slice(-MAX_EVENTS).length - 1;

                            content = (
                                <Box key={i}>
                                    <Text backgroundColor="#1a1a2e" color="white">
                                        {isLast ? <Glitter /> : ' ⏺ '}
                                    </Text>
                                    <Text backgroundColor="#1a1a2e" color="white" bold> {event.tool}</Text>
                                    <Text backgroundColor="#1a1a2e" color="gray">({argsSummary}) </Text>
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
                    })
                )}
            </Box>

            {/* Input & Footer - Fixed Height at Bottom */}
            <Box flexDirection="column" flexShrink={0}>

                {/* Interactive Prompts */}
                {/* ... prompts ... */}
                {pendingPrompt?.type === 'approval' && (
                    <Box marginBottom={1}>
                        <ApprovalPrompt
                            requestId={pendingPrompt.requestId}
                            context={pendingPrompt.context}
                            diff={pendingPrompt.diff}
                            onResolve={handlePromptResolve}
                        />
                    </Box>
                )}
                {/* ... other prompts ... */}
                {pendingPrompt?.type === 'choice' && (
                    <Box marginBottom={1}>
                        <ChoicePrompt
                            question={pendingPrompt.question}
                            options={pendingPrompt.options}
                            onResolve={handlePromptResolve}
                        />
                    </Box>
                )}
                {pendingPrompt?.type === 'text_input' && (
                    <Box marginBottom={1}>
                        <TextInputPrompt
                            requestId={pendingPrompt.requestId}
                            prompt={pendingPrompt.prompt}
                            masked={pendingPrompt.masked}
                            placeholder={pendingPrompt.placeholder}
                            onResolve={handlePromptResolve}
                        />
                    </Box>
                )}

                {/* Settings Menu REMOVED from here */}


                {/* Footer Stats Area */}
                <Box paddingX={0} marginBottom={0} marginTop={0}>
                    <Footer mode={stats.mode} model={stats.model} />
                </Box>

                {/* Input Area (disabled when prompt is active) */}
                <Box flexDirection="column">
                    {/* Separator Line (Responsive) */}
                    <Box
                        borderStyle="single"
                        borderTop={false}
                        borderLeft={false}
                        borderRight={false}
                        borderBottom={true}
                        borderColor="gray"
                        marginBottom={0}
                    />

                    <Box marginY={0} paddingX={0}>
                        <Text color="red" bold>❯ </Text>
                        <TextInput
                            key={inputKey}
                            value={input}
                            onChange={pendingPrompt ? () => { } : setInput}
                            onSubmit={pendingPrompt ? () => { } : handleSubmit}
                            placeholder={pendingPrompt ? 'Respond to prompt above...' : 'Type a message or command...'}
                            focus={activeView === 'chat'} // Only focus when in chat mode
                        />
                    </Box>

                    {/* Bottom Separator (Responsive) */}
                    <Box
                        borderStyle="single"
                        borderTop={true}
                        borderLeft={false}
                        borderRight={false}
                        borderBottom={false}
                        borderColor="gray"
                        marginTop={0}
                    />
                </Box>

                {/* Popup now appears BELOW the input area */}
                <CommandPopup
                    matches={matches}
                    selectedIndex={selectedIndex}
                />

                {/* Footer / Status Bar - Hidden when popup is open */}
                {matches.length === 0 && (
                    <Box flexDirection="column" marginTop={0} paddingX={0}>
                        {/* Row 1 */}
                        <Box flexDirection="row" justifyContent="space-between">
                            <Box>
                                <Text>
                                    {stats.mode === 'plan' ? '⏸ ' : stats.mode === 'auto' ? '▶ ' : '⏺ '}
                                    <Text bold>{stats.mode} mode on</Text>
                                    <Text dimColor> (shift+Tab to cycle)</Text>
                                </Text>
                            </Box>
                            <Box>
                                <Text dimColor>
                                    Context: {Math.round(usage.getContextUsage(stats.model).used / 1000)}k / {Math.round(usage.getContextUsage(stats.model).limit / 1000)}k ({Math.round((usage.getContextUsage(stats.model).used / usage.getContextUsage(stats.model).limit) * 100)}%)
                                </Text>
                            </Box>
                        </Box>

                        {/* Row 2 */}
                        <Box flexDirection="row" justifyContent="space-between">
                            <Box>
                                {/* Placeholder for status messages or errors */}
                                <Text dimColor></Text>
                            </Box>
                            <Box>
                                <Text dimColor>@aurora-foundation/obsidian-next</Text>
                            </Box>
                        </Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
};
