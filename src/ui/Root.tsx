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
import { MessageList } from './MessageList.js';
import { EphemeralItem } from '../components/EphemeralItem.js';
import { Footer } from '../components/Footer.js';
import { DoctorView } from './views/DoctorView.js';
import { HelpView } from './views/HelpView.js';
import { InitView } from './views/InitView.js';
import { UsageView } from './views/UsageView.js';
import { TaskView } from './views/TaskView.js';
import { SessionView } from './views/SessionView.js';
import { MCPView } from './views/MCPView.js';
import { ContextView } from './views/ContextView.js';
import { SettingsMenu, MenuView } from '../components/SettingsMenu.js';

import { history } from '../core/history.js';
import { usage } from '../core/usage.js';
import { config } from '../core/config.js';
import { context } from '../core/context.js';
import { agent } from '../core/agent.js';
import { tasks } from '../core/tasks.js';
import { session } from '../core/session.js';
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
    const [taskProgress, setTaskProgress] = useState(tasks.getProgress());
    const { exit } = useApp();

    // State for footer data
    const [stats, setStats] = useState({ cost: 0, model: 'Loading...', mode: 'safe' as 'auto' | 'plan' | 'safe' });

    // Active View State Machine
    type ActiveView = 'chat' | 'settings' | 'doctor' | 'help' | 'init' | 'usage' | 'task' | 'context' | 'sessions' | 'mcp';
    const [activeView, setActiveView] = useState<ActiveView>('chat');
    const [settingsTab, setSettingsTab] = useState<MenuView | undefined>();

    const [isBusy, setIsBusy] = useState(false);
    const [isInitCommand, setIsInitCommand] = useState(false);
    const [isBackgroundBusy, setIsBackgroundBusy] = useState(false);
    const [lastActivity, setLastActivity] = useState(Date.now());
    const [isIdle, setIsIdle] = useState(false);
    const [isSleep, setIsSleep] = useState(false);
    const [latestActivity, setLatestActivity] = useState<{ content: string; color: string; } | undefined>();

    // Update latest activity on any agent event
    useEffect(() => {
        const updateActivity = async () => {
            const { auditLog } = await import('../core/auditLog.js');
            const activities = await auditLog.getRecentActivities(1);
            if (activities.length > 0) {
                setLatestActivity(activities[0]);
            }
        };
        const sub = (event: AgentEvent) => {
            // Only update on meaningful events to avoid flicker
            if (event.type !== 'thought') {
                updateActivity();
            }
        };

        bus.on('agent', sub);
        // Also fetch on initial load
        updateActivity();

        return () => {
            bus.off('agent', sub);
        };
    }, []);

    // Idle/Sleep detection
    useEffect(() => {
        const checkIdle = () => {
            const now = Date.now();
            const diff = now - lastActivity;

            // 60s for idle, 5m for sleep
            if (diff > 300000) {
                setIsSleep(true);
                setIsIdle(true);
            } else if (diff > 60000) {
                setIsIdle(true);
                setIsSleep(false);
            } else {
                setIsIdle(false);
                setIsSleep(false);
            }
        };

        const timer = setInterval(checkIdle, 5000);
        return () => clearInterval(timer);
    }, [lastActivity]);

    // Reset activity on input
    useEffect(() => {
        if (input.length > 0) {
            setLastActivity(Date.now());
        }
    }, [input]);

    // Handle prompt resolution
    const handlePromptResolve = useCallback(() => {
        setPendingPrompt(null);
        setLastActivity(Date.now());
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
            // Force sync tasks just in case init finished after render
            setTaskProgress(tasks.getProgress());
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

            // Handle session restore - set events directly without clearing DB
            if (event.type === 'restore_history') {
                const restored = (event as any).events || [];
                setEvents(restored);
                setPendingPrompt(null);
                return;
            }

            // Handle shutdown - exit after rendering final messages
            // Handle thinking/busy state
            const completionTypes: string[] = ['done', 'error', 'command_executed', 'shutdown_complete'];
            const startTypes: string[] = ['tool_start', 'thought'];

            if (completionTypes.includes(event.type)) {
                setIsBusy(false);
                setIsInitCommand(false);
            } else if (startTypes.includes(event.type)) {
                setIsBusy(true);
            }

            if (event.type === 'shutdown_complete') {
                setIsBackgroundBusy(false);
                // Delay exit to allow final render
                setTimeout(() => {
                    exit();
                }, 200);
                return;
            }
            // Background task state
            else if (event.type === 'scheduler_task_started') {
                setIsBackgroundBusy(true);
            }
            else if (event.type === 'scheduler_task_completed' || event.type === 'scheduler_task_failed') {
                setIsBackgroundBusy(false);
            }
            // Update task progress
            else if (event.type === 'task_update') {
                setTaskProgress(tasks.getProgress());
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

            if (event.type === 'view_request') {
                setActiveView(event.viewId as any);
                if (event.viewId === 'settings') {
                    // Map specific commands to tabs
                    const trigger = event.command || '';
                    if (trigger === 'sandbox') setSettingsTab('security');
                    else if (trigger === 'mode') setSettingsTab('mode');
                    else if (trigger === 'models') setSettingsTab('models');
                    else if (trigger === 'config') setSettingsTab('categories');
                    else if (event.params?.includes('sandbox')) setSettingsTab('security');
                    else if (event.params?.includes('mode')) setSettingsTab('mode');
                    else if (event.params?.includes('model') || event.params?.includes('models')) setSettingsTab('models');
                    else if (event.params?.includes('config')) setSettingsTab('categories');
                    else setSettingsTab(undefined);
                }
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

            // Any agent activity resets idle timer
            setLastActivity(Date.now());
        };

        const userHandler = (event: any) => {
            if (event.type === 'user_input') {
                if (event.content.trim().startsWith('/init')) {
                    setIsInitCommand(true);
                }
                if (!event.silent) {
                    setEvents(prev => [...prev, { type: 'user_input', content: event.content } as any]);
                }
                setIsBusy(true); // User input starts the busy state
                setLastActivity(Date.now());
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
    const [cursorVisible, setCursorVisible] = useState(true);

    // Blinking cursor effect
    useEffect(() => {
        const timer = setInterval(() => {
            setCursorVisible(v => !v);
        }, 500);
        return () => clearInterval(timer);
    }, []);

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

    // Shutdown Logic
    const handleExit = useCallback(async () => {
        bus.emitAgent({
            type: 'thought',
            content: 'Saving session and shutting down...',
        });

        // Save the full session state (Context, History, Tasks)
        // This allows /resume to work correctly
        try {
            const { sessionId } = await session.save();
            bus.emitAgent({ type: 'thought', content: `Session saved: ${sessionId}` });
        } catch (err) {
            bus.emitAgent({ type: 'error', message: `Failed to save session: ${err}` });
        }

        // Clear UI state but preserve DB events for session restoration
        // Note: history.clear() was removed here - it was deleting events needed for /resume
        bus.emitAgent({ type: 'clear_history' });

        setTimeout(() => {
            exit();
        }, 800);
    }, [exit]);

    useInput((inputChar, key) => {
        // Graceful Exit - Ctrl+C (global, works in any view)
        if (inputChar === '\x03' || (key.ctrl && inputChar === 'c')) {
            // Prevent multiple triggers
            if (activeView === 'chat' && pendingPrompt === null) {
                handleExit();
            } else {
                // Force exit if stuck or in other views
                exit();
            }
            return;
        }

        // Skip all other input handling when not in chat view
        // Let child views (SessionView, SettingsMenu, etc.) handle their own input
        if (activeView !== 'chat') {
            return;
        }

        // Global Interrupt - Escape
        if (key.escape && isBusy) {
            bus.emitUser({ type: 'user_interrupt' });
            setIsBusy(false);
            return;
        }

        // Escape to close popup without executing
        if (key.escape && matches.length > 0) {
            setInput('');
            return;
        }

        // Mode Toggle - Shift+Tab (only when not in popup)
        if (key.shift && key.tab && matches.length === 0) {
            cycleMode();
            return;
        }

        // Task View Toggle - Ctrl+T
        if (key.ctrl && inputChar === 't') {
            setActiveView('task');
            return;
        }

        if (pendingPrompt || isBusy) return;

        // Popup navigation - only when popup is visible
        if (matches.length > 0) {
            if (key.upArrow) {
                setSelectedIndex(prev => (prev > 0 ? prev - 1 : matches.length - 1));
                return;
            }

            if (key.downArrow) {
                setSelectedIndex(prev => (prev < matches.length - 1 ? prev + 1 : 0));
                return;
            }

            // Tab to autocomplete without executing
            if (key.tab && !key.shift) {
                const selected = matches[selectedIndex];
                if (selected && input !== selected.name) {
                    setInput(selected.name);
                    setInputKey(prev => prev + 1);
                }
                return;
            }

            // Enter to execute selected command from popup
            if (key.return) {
                const selected = matches[selectedIndex];
                if (selected) {
                    setInput('');
                    handleSubmit(selected.name);
                }
                return;
            }
        }

        // Regular text input - works with or without popup
        if (key.return) {
            handleSubmit(input);
            return;
        }
        if (key.backspace || key.delete) {
            setInput(prev => prev.slice(0, -1));
            return;
        }

        // Paste and regular input
        if (!key.ctrl && !key.meta && inputChar) {
            setInput(prev => prev + inputChar);
        }
    });
    // --------------- POPUP LOGIC END ---------------

    const lastSubmitTime = React.useRef(0);

    const handleSubmit = (value: string) => {
        if (!value.trim()) return;

        // Debounce double-submissions
        const now = Date.now();
        if (now - lastSubmitTime.current < 150) return;
        lastSubmitTime.current = now;

        const trimmed = value.trim();

        // 2. Determine if this is a view command (silent - no echo)
        const matchingCommand = COMMANDS.find(c => c.name === trimmed);
        const silent = matchingCommand?.isView || false;

        // 3. Emit the user input and clear
        bus.emitUser({ type: 'user_input', content: trimmed, silent });
        setInput('');
    };

    // Listen for UI-specific approval responses
    useEffect(() => {
        const uiHandler = (event: any) => {
            if (event.type === 'approval_response') {
                if (event.requestId === 'ui:clear') {
                    if (event.approved) {
                        setEvents([]);
                        history.clear();
                        bus.emitAgent({ type: 'clear_history' });
                    }
                    setPendingPrompt(null);
                } else if (event.requestId === 'ui:exit') {
                    if (event.approved) {
                        handleExit();
                    }
                    setPendingPrompt(null);
                }
            }
        };

        bus.on('user', uiHandler);
        return () => {
            bus.off('user', uiHandler);
        };
    }, [handleExit]);

    const renderInput = () => {
        const placeholder = isBusy ? 'Thinking...' : (pendingPrompt ? 'Respond to prompt above...' : 'Type a message or command...');

        if (input.length === 0) {
            return <Text color="gray">{placeholder}</Text>;
        }

        const commandMatch = input.match(/^\/([a-zA-Z0-9_-]+)/);
        if (commandMatch) {
            const command = commandMatch[0];
            const rest = input.slice(command.length);
            // Check if this is a recognized command
            const isValidCommand = COMMANDS.some(c => c.name === command || c.name.startsWith(command));
            const isExactMatch = COMMANDS.some(c => c.name === command);
            return (
                <Text>
                    <Text color={isExactMatch ? 'red' : isValidCommand ? 'yellow' : undefined}>{command}</Text>
                    {rest}
                    {cursorVisible && <Text>_</Text>}
                </Text>
            );
        }

        return (
            <Text>
                {input}
                {cursorVisible && <Text>_</Text>}
            </Text>
        );
    };

    return (
        <Box flexDirection="column" height="100%">
            {/* Header / Dashboard - Hidden when overlay views are active */}
            {activeView === 'chat' && (
                <Box flexShrink={0}>
                    <Dashboard
                        isBusy={isBusy}
                        isBackgroundBusy={isBackgroundBusy}
                        isIdle={isIdle}
                        isSleep={isSleep}
                        latestActivity={latestActivity}
                    />
                </Box>
            )}

            {/* Active View Area */}
            <Box flexDirection="column" flexGrow={1} overflowY={activeView === 'chat' ? undefined : 'hidden'} justifyContent={activeView !== 'chat' ? "flex-start" : "flex-end"} marginY={1}>
                {activeView === 'settings' ? (
                    <SettingsMenu initialTab={settingsTab} onClose={() => setActiveView('chat')} />
                ) : activeView === 'doctor' ? (
                    <DoctorView onClose={() => setActiveView('chat')} />
                ) : activeView === 'help' ? (
                    <HelpView onClose={() => setActiveView('chat')} />
                ) : activeView === 'init' ? (
                    <InitView onClose={() => setActiveView('chat')} />
                ) : activeView === 'usage' ? (
                    <UsageView onClose={() => setActiveView('chat')} />
                ) : activeView === 'task' ? (
                    <TaskView onClose={() => setActiveView('chat')} />
                ) : activeView === 'context' ? (
                    <ContextView onClose={() => setActiveView('chat')} />
                ) : activeView === 'sessions' ? (
                    <SessionView
                        onClose={() => setActiveView('chat')}
                        onResume={async (id) => {
                            // Trigger resume via agent event
                            // We need to tell the agent to restart/reload with this session
                            // For now, let's just emit a command or handle it.
                            // Actually, switching sessions at runtime is tricky.
                            // Easier: Exit and tell user to run with flag?
                            // OR: Agent supports re-init.
                            // Let's try to re-init.
                            setActiveView('chat');
                            bus.emitUser({ type: 'user_input', content: `/resume ${id}` });
                        }}
                    />
                ) : activeView === 'mcp' ? (
                    <MCPView onExit={() => setActiveView('chat')} />
                ) : (
                    <MessageList events={events} maxEvents={MAX_EVENTS} />
                )}
            </Box>

            {/* Input & Footer - Fixed Height at Bottom - Hidden when overlay views are active */}
            {activeView === 'chat' && (
                <Box flexDirection="column" flexShrink={0}>
                    {/* Persistent Thinking Indicator - Sticky at bottom */}
                    <Box flexDirection="row" marginBottom={0} marginLeft={2}>
                        {isBusy && !isInitCommand && (
                            <Glitter>Thinking...</Glitter>
                        )}
                        {isBackgroundBusy && (
                            <Box marginLeft={isBusy ? 4 : 0}>
                                <Glitter>Background...</Glitter>
                            </Box>
                        )}
                    </Box>

                    {/* Interactive Prompts */}
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

                    {/* Footer Stats Area */}
                    <Box paddingX={0} marginBottom={0} marginTop={0}>
                        <Footer mode={stats.mode} model={stats.model} taskProgress={taskProgress} />
                    </Box>

                    {/* Input Area (disabled when prompt is active) */}
                    <Box flexDirection="column">
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
                            {renderInput()}
                        </Box>

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
                                        Context: {(usage.getContextUsage(stats.model).used / 1000).toFixed(1)}k / {(usage.getContextUsage(stats.model).limit / 1000).toFixed(0)}k ({Math.round(usage.getContextUsage(stats.model).percentRemaining === 100 ? 0 : (100 - usage.getContextUsage(stats.model).percentRemaining))}%)
                                    </Text>
                                </Box>
                            </Box>

                            {/* Row 2 */}
                            <Box flexDirection="row" justifyContent="space-between">
                                <Box>
                                    <Text dimColor></Text>
                                </Box>
                                <Box>
                                    <Text dimColor>@aurora-foundation/obsidian-next</Text>
                                </Box>
                            </Box>
                        </Box>
                    )}
                </Box>
            )}
        </Box >
    );
};
