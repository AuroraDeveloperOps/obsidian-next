import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { bus } from '../core/bus.js';
import { AgentEvent, Option } from '../events/types.js';

import { ApprovalPrompt } from '../components/ApprovalPrompt.js';
import { ChoicePrompt } from '../components/ChoicePrompt.js';
import { TextInputPrompt } from '../components/TextInputPrompt.js';
import { ThinkingIndicator } from '../components/ThinkingIndicator.js';
import { CommandPalette } from '../components/CommandPalette.js';
import { CommandPopup, COMMANDS } from './CommandPopup.js';
import { MessageList } from './MessageList.js';
import { WelcomeBanner } from '../components/WelcomeBanner.js';

import { DoctorView } from './views/DoctorView.js';
import { HelpView } from './views/HelpView.js';
import { InitView } from './views/InitView.js';
import { UsageView } from './views/UsageView.js';
import { TaskView } from './views/TaskView.js';
import { SessionView } from './views/SessionView.js';
import { MCPView } from './views/MCPView.js';
import { ContextView } from './views/ContextView.js';
import { StatusView } from './views/StatusView.js';
import { ModeSelectView } from './views/ModeSelectView.js';
import { MemoryView } from './views/MemoryView.js';
import { ToolListView } from './views/ToolListView.js';
import { DiffListView } from './views/DiffListView.js';
import { UndoView } from './views/UndoView.js';
import { PilotView } from './views/PilotView.js';
import { ModelsView } from './views/ModelsView.js';
import { SchedulerView } from './views/SchedulerView.js';
import { ScheduledTasksView } from './views/ScheduledTasksView.js';
import { OllamaView } from './views/OllamaView.js';
import { SandboxView } from './views/SandboxView.js';
import { SkillsView } from './views/SkillsView.js';
import { SettingsMenu, MenuView } from '../components/SettingsMenu.js';

import { history } from '../core/history.js';
import { usage } from '../core/usage.js';
import { config } from '../core/config.js';
import { context } from '../core/context.js';
import { agent } from '../core/agent.js';
import { tasks } from '../core/tasks.js';
import { session } from '../core/session.js';
import { mcp } from '../core/mcp.js';
import { getGitBranch } from '../utils/ui.js';

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

const MAX_EVENTS = 50;

// View types - extensible for Phase 2 overlay views
type ActiveView =
	| 'chat'
	| 'settings'
	| 'doctor'
	| 'help'
	| 'init'
	| 'usage'
	| 'task'
	| 'context'
	| 'sessions'
	| 'mcp'
	| 'status'
	| 'mode_select'
	| 'memory'
	| 'tool_list'
	| 'diff_list'
	| 'undo'
	| 'pilot'
	| 'models'
	| 'scheduler'
	| 'scheduled_tasks'
	| 'skills'
	| 'ollama'
	| 'sandbox';

export const Root = () => {
	const [events, setEvents] = useState<AgentEvent[]>([]);
	const [input, setInput] = useState('');
	const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
	const [taskProgress, setTaskProgress] = useState(tasks.getProgress());
	const { exit } = useApp();
	const { stdout } = useStdout();
	const [columns, setColumns] = useState(stdout?.columns || 80);
	const [rows, setRows] = useState(stdout?.rows || 24);
	const [scrollOffset, setScrollOffset] = useState(0);

	// Dynamic layout calculation
	const BANNER_HEIGHT = 6;
	const INPUT_AREA_HEIGHT = 6; // Prompt, separator, info bar, thinking
	const dynamicMaxEvents = Math.max(5, rows - (BANNER_HEIGHT + INPUT_AREA_HEIGHT));

	useEffect(() => {
		if (!stdout) return;
		const onResize = () => {
			setColumns(stdout.columns);
			setRows(stdout.rows);
		};
		stdout.on('resize', onResize);
		return () => {
			stdout.off('resize', onResize);
		};
	}, [stdout]);

	// Footer stats
	const [stats, setStats] = useState({
		cost: 0,
		model: 'Loading...',
		mode: 'safe' as 'auto' | 'plan' | 'safe',
		version: 'v...',
		sandbox: 'local' as 'local' | 'sandbox',
		branch: ''
	});

	// Active view state machine
	const [activeView, setActiveView] = useState<ActiveView>('chat');
	const [settingsTab, setSettingsTab] = useState<MenuView | undefined>();

	const [isBusy, setIsBusy] = useState(false);
	const [isInitCommand, setIsInitCommand] = useState(false);
	const [isBackgroundBusy, setIsBackgroundBusy] = useState(false);
	const [currentActivity, setCurrentActivity] = useState<string | null>(null);
	const [showPalette, setShowPalette] = useState(false);
	const [busyStartTime, setBusyStartTime] = useState(Date.now());
	const [contextPct, setContextPct] = useState(100);
	const [lastExitAttempt, setLastExitAttempt] = useState(0);

	// Throttle ALL event-driven re-renders (batch updates)
	const pendingEventsRef = useRef<AgentEvent[]>([]);
	const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const RENDER_BATCH_MS = 150; // Max 6-7 re-renders/sec instead of 10+

	// Load initial footer data and subscribe to updates
	useEffect(() => {
		const updateStats = async () => {
			const cfg = await config.load();
			const conf = cfg as any; // Cast to access optional/dynamic props
			const ver = await config.getVersion();
			const version = ver.startsWith('v') ? ver : `v${ver}`;
			const branch = getGitBranch();
			
			let displayModel = cfg.model;
			if (conf.provider === 'ollama') {
				displayModel = conf.ollama?.models?.chat || 'Unknown Ollama Model';
			} else if (conf.provider === 'moe') {
				displayModel = 'MoE (Auto)';
			}

			setStats({
				cost: usage.getSessionCost(),
				model: displayModel,
				mode: context.getMode(),
				version,
				sandbox: cfg.executionMode || 'local',
				branch
			});
			setTaskProgress(tasks.getProgress());

			// Update context usage
			const ctx = usage.getContextUsage(cfg.model);
			const remaining = ctx.limit > 0
				? Math.round(100 - (ctx.used / ctx.limit) * 100)
				: 100;
			setContextPct(Math.max(0, remaining));
		};

		updateStats();

		const statHandler = (event: AgentEvent) => {
			if (event.type === 'done' || event.type === 'tool_result') {
				updateStats();
			}
		};
		bus.on('agent', statHandler);
		return () => { bus.off('agent', statHandler); };
	}, []);

	// Load history on mount
	useEffect(() => {
		history.load().then((loadedEvents) => {
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

	// Flush pending events into state (batched to reduce re-renders)
	const flushEvents = useCallback(() => {
		flushTimerRef.current = null;
		const batch = pendingEventsRef.current;
		if (batch.length === 0) return;
		pendingEventsRef.current = [];

		setEvents((prev) => {
			let result = prev;
			for (const event of batch) {
				// Handle streaming thoughts (look backwards for the stream start)
				if (event.type === 'thought' && event.streaming) {
					let replaced = false;
					for (let i = result.length - 1; i >= 0; i--) {
						const e = result[i] as any;
						if (e.type === 'user_input' || e.type === 'clear_history') break;
						if (e.type === 'thought' && e.streaming) {
							if (event.content.startsWith(e.content)) {
								result = [...result];
								result[i] = event;
								replaced = true;
							}
							break;
						}
					}
					if (replaced) continue;
				}

				// Replace consecutive thoughts
				const last = result[result.length - 1];
				if (event.type === 'thought' && last && last.type === 'thought') {
					if (last.content === event.content) continue;
					result = [...result];
					result[result.length - 1] = event;
				} else {
					result = [...result, event];
				}
			}
			return result;
		});

		// Auto-scroll to bottom when new events arrive
		setScrollOffset(0);
	}, []);

	// Schedule a batched flush (coalesces rapid events into one render)
	const scheduleFlush = useCallback((immediate?: boolean) => {
		if (immediate) {
			// For user-interactive events (prompts, errors), flush now
			if (flushTimerRef.current) {
				clearTimeout(flushTimerRef.current);
			}
			flushEvents();
		} else if (!flushTimerRef.current) {
			flushTimerRef.current = setTimeout(flushEvents, RENDER_BATCH_MS);
		}
	}, [flushEvents]);

	// Main event handler
	useEffect(() => {
		const handler = (event: AgentEvent) => {
			if (event.type === 'clear_history') {
				setEvents([]);
				history.clear();
				setPendingPrompt(null);
				return;
			}

			if (event.type === 'restore_history') {
				const restored = (event as any).events || [];
				setEvents(restored);
				setPendingPrompt(null);
				return;
			}

			// Busy state tracking
			const completionTypes = ['done', 'error', 'command_executed', 'shutdown_complete'];
			const startTypes = ['tool_start'];

			if (completionTypes.includes(event.type)) {
				setIsBusy(false);
				setIsInitCommand(false);
			} else if (startTypes.includes(event.type)) {
				setIsBusy(true);
				setBusyStartTime(Date.now());
			}

			if (event.type === 'shutdown_complete') {
				setIsBackgroundBusy(false);
				setTimeout(() => { exit(); }, 200);
				return;
			} else if (event.type === 'scheduler_task_started') {
				setIsBackgroundBusy(true);
			} else if (event.type === 'scheduler_task_completed' || event.type === 'scheduler_task_failed') {
				setIsBackgroundBusy(false);
			} else if (event.type === 'task_update') {
				setTaskProgress(tasks.getProgress());
			}

			// Interactive prompts - flush immediately (user needs to see these NOW)
			if (event.type === 'approval_request') {
				setPendingPrompt({
					type: 'approval',
					requestId: event.requestId,
					context: event.context,
					diff: event.diff
				});
				return;
			}

			if (event.type === 'choice_request') {
				setPendingPrompt({
					type: 'choice',
					question: event.question,
					options: event.options
				});
				return;
			}

			if (event.type === 'text_input_request') {
				setPendingPrompt({
					type: 'text_input',
					requestId: event.requestId,
					prompt: event.prompt,
					masked: event.masked,
					placeholder: event.placeholder
				});
				return;
			}

			// View navigation
			if (event.type === 'view_request') {
				setActiveView(event.viewId as any);
				if (event.viewId === 'sandbox') {
					return;
				}
				if (event.viewId === 'settings') {
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

			// Track current activity
			if (event.type === 'tool_start') {
				try {
					const args = JSON.parse(event.args);
					const firstVal = Object.values(args)[0];
					const summary = typeof firstVal === 'string'
						? (firstVal.length > 30 ? firstVal.slice(0, 30) + '...' : firstVal)
						: '';
					setCurrentActivity(`${event.tool} ${summary}`.trim());
				} catch {
					setCurrentActivity(event.tool);
				}
			} else if (event.type === 'tool_result' || event.type === 'done' || event.type === 'error') {
				setCurrentActivity(null);
			}

			// Skip hidden thoughts entirely - no render needed
			if (event.type === 'thought' && (event as any).hidden) {
				return;
			}

			// Queue event for batched render
			pendingEventsRef.current.push(event);

			// Flush immediately for completion/error events, batch everything else
			const isImmediate = event.type === 'done' || event.type === 'error';
			scheduleFlush(isImmediate);
		};

		const userHandler = (event: any) => {
			if (event.type === 'user_input') {
				if (event.content.trim().startsWith('/init')) {
					setIsInitCommand(true);
				}
				if (!event.silent) {
					pendingEventsRef.current.push({ type: 'user_input', content: event.content } as any);
					scheduleFlush(true); // Flush immediately - user wants to see their input
				}
				setIsBusy(true);
				setBusyStartTime(Date.now());
			}
		};

		bus.on('agent', handler);
		bus.on('user', userHandler);
		return () => {
			bus.off('agent', handler);
			bus.off('user', userHandler);
			if (flushTimerRef.current) {
				clearTimeout(flushTimerRef.current);
			}
		};
	}, [scheduleFlush]);

	const [inputKey, setInputKey] = useState(0);

	// Command popup logic
	const [selectedIndex, setSelectedIndex] = useState(0);
	const query = input.toLowerCase();
	const isCommand = input.startsWith('/');
	const matches = isCommand ? COMMANDS.filter((c) => c.name.startsWith(query)) : [];

	useEffect(() => { setSelectedIndex(0); }, [input]);

	// Mode cycling
	const cycleMode = useCallback(async () => {
		const modes: Array<'auto' | 'plan' | 'safe'> = ['auto', 'plan', 'safe'];
		const currentIndex = modes.indexOf(stats.mode);
		const nextMode = modes[(currentIndex + 1) % modes.length];
		await agent.setMode(nextMode);
		setStats((prev) => ({ ...prev, mode: nextMode }));
	}, [stats.mode]);

	// Shutdown
	const handleExit = useCallback(async () => {
		bus.emitAgent({ type: 'thought', content: 'SHUTDOWN: Saving state...' });

		try {
			const summary = await session.getSummary();
			const { sessionId } = await session.save();
			
			const summaryText = [
				`SESSION SUMMARY [${sessionId}]`,
				`Duration: ${session.formatDuration(summary.duration)}`,
				`Activity: ${summary.filesRead} read · ${summary.filesModified} modified`,
				`Tasks: ${summary.tasksCompleted} done · ${summary.tasksPending} open`,
				`Total Cost: $${summary.totalCost.toFixed(4)}`
			].join('\n');

			bus.emitAgent({ type: 'thought', content: summaryText });
		} catch (err) {
			bus.emitAgent({ type: 'error', message: `Failed to save session: ${err}` });
		}

		// Gracefully disconnect MCP servers to prevent EPIPE errors
		await mcp.disconnectAll();
		
		setTimeout(() => { exit(); }, 2000);
	}, [exit]);

	// Prompt resolution
	const handlePromptResolve = useCallback(() => {
		setPendingPrompt(null);
	}, []);

	// Input handling
	useInput((inputChar, key) => {
		if (inputChar === '\x03' || (key.ctrl && inputChar === 'c')) {
			const now = Date.now();
			if (now - lastExitAttempt < 2000) {
				if (activeView === 'chat' && pendingPrompt === null) {
					handleExit();
				} else {
					exit();
				}
			} else {
				setLastExitAttempt(now);
				bus.emitAgent({ type: 'thought', content: 'Press Ctrl+C again to exit' });
			}
			return;
		}

		if (activeView !== 'chat') return;

		if (key.escape && isBusy) {
			bus.emitUser({ type: 'user_interrupt' });
			setIsBusy(false);
			return;
		}

		if (key.escape && matches.length > 0) {
			setInput('');
			return;
		}

		// Mode Toggle - Shift+Tab
		if (key.shift && key.tab && matches.length === 0) {
			cycleMode();
			return;
		}

		// Task View - Ctrl+T
		if (key.ctrl && inputChar === 't') {
			setActiveView('task');
			return;
		}

		// Command Palette - Ctrl+K
		if (key.ctrl && inputChar === 'k') {
			setShowPalette((prev) => !prev);
			return;
		}

		if (showPalette) return;
		if (pendingPrompt || isBusy) return;

		// Popup navigation
		if (matches.length > 0) {
			if (key.upArrow) {
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : matches.length - 1));
				return;
			}
			if (key.downArrow) {
				setSelectedIndex((prev) => (prev < matches.length - 1 ? prev + 1 : 0));
				return;
			}
			if (key.tab && !key.shift) {
				const selected = matches[selectedIndex];
				if (selected && input !== selected.name) {
					setInput(selected.name);
					setInputKey((prev) => prev + 1);
				}
				return;
			}
			if (key.return) {
				const selected = matches[selectedIndex];
				if (selected) {
					setInput('');
					handleSubmit(selected.name);
				}
				return;
			}
		}

		if (key.return) {
			handleSubmit(input);
			return;
		}
		if (key.backspace || key.delete) {
			setInput((prev) => prev.slice(0, -1));
			return;
		}

		if (!key.ctrl && !key.meta && inputChar) {
			setInput((prev) => prev + inputChar);
		}
	});

	const lastSubmitTime = React.useRef(0);

	const handleSubmit = (value: string) => {
		if (!value.trim()) return;

		const now = Date.now();
		if (now - lastSubmitTime.current < 150) return;
		lastSubmitTime.current = now;

		const trimmed = value.trim();
		const matchingCommand = COMMANDS.find((c) => c.name === trimmed);
		const silent = matchingCommand?.isView || false;

		bus.emitUser({ type: 'user_input', content: trimmed, silent });
		setInput('');
	};

	// UI-specific approval responses
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
		return () => { bus.off('user', uiHandler); };
	}, [handleExit]);

	const renderInput = () => {
		const placeholder = isBusy
			? 'Thinking...'
			: pendingPrompt
				? 'Respond to prompt above...'
				: 'Message or / for commands...';

		if (input.length === 0) {
			return <Text color="gray">{placeholder}</Text>;
		}

		const commandMatch = input.match(/^\/([a-zA-Z0-9_-]+)/);
		if (commandMatch) {
			const command = commandMatch[0];
			const rest = input.slice(command.length);
			const isExactMatch = COMMANDS.some((c) => c.name === command);
			const isValidCommand = COMMANDS.some((c) => c.name === command || c.name.startsWith(command));
			return (
				<Text>
					<Text color={isExactMatch ? 'red' : isValidCommand ? 'yellow' : undefined}>
						{command}
					</Text>
					{rest}
					<Text>_</Text>
				</Text>
			);
		}

		return (
			<Text>
				{input}
				<Text>_</Text>
			</Text>
		);
	};

	// Token tracking for thinking indicator (only recalc when busy state changes)
	const tokens = React.useMemo(() => usage.getSessionTokens(), [isBusy]);

	// Memoize separator line to avoid recalculating on every render
	const separatorLine = React.useMemo(() => '─'.repeat(columns), [columns]);

	// Render the active overlay view
	const renderView = () => {
		const closeView = () => setActiveView('chat');

		switch (activeView) {
			case 'settings':
				return <SettingsMenu initialTab={settingsTab} onClose={closeView} />;
			case 'doctor':
				return <DoctorView onClose={closeView} />;
			case 'help':
				return <HelpView onClose={closeView} />;
			case 'init':
				return <InitView onClose={closeView} />;
			case 'usage':
				return <UsageView onClose={closeView} />;
			case 'task':
				return <TaskView onClose={closeView} />;
			case 'context':
				return <ContextView onClose={closeView} />;
			case 'sessions':
				return (
					<SessionView
						onClose={closeView}
						onResume={async (id) => {
							closeView();
							bus.emitUser({ type: 'user_input', content: `/resume ${id}` });
						}}
					/>
				);
			case 'mcp':
				return <MCPView onExit={closeView} />;
			case 'status':
				return <StatusView onClose={closeView} />;
			case 'mode_select':
				return <ModeSelectView onClose={closeView} />;
			case 'memory':
				return <MemoryView onClose={closeView} />;
			case 'tool_list':
				return <ToolListView onClose={closeView} />;
			case 'diff_list':
				return <DiffListView onClose={closeView} />;
			case 'undo':
				return <UndoView onClose={closeView} />;
			case 'pilot':
				return <PilotView onClose={closeView} />;
			case 'models':
				return <ModelsView onClose={closeView} />;
			case 'scheduler':
				return <SchedulerView onClose={closeView} />;
			case 'scheduled_tasks':
				return <ScheduledTasksView onClose={closeView} />;
			case 'ollama':
				return <OllamaView onClose={closeView} />;
			case 'sandbox':
				return <SandboxView onClose={closeView} />;
			case 'skills':
				return <SkillsView onExit={closeView} />;
			default:
				return null;
		}
	};

	// Memoize banner to prevent re-rendering on every keystroke/event
	const banner = React.useMemo(() => (
		<WelcomeBanner
			model={stats.model}
			mode={stats.mode}
			version={stats.version}
			sandbox={stats.sandbox}
			branch={stats.branch}
		/>
	), [stats.model, stats.mode, stats.version, stats.sandbox, stats.branch]);

	return (
		<Box flexDirection="column" height={rows}>
			{/* Fixed Banner Header */}
			{activeView === 'chat' && (
				<Box flexShrink={0}>{banner}</Box>
			)}

			{/* Main Content Area */}
			<Box
				flexDirection="column"
				flexGrow={activeView === 'chat' ? 1 : 1}
				overflowY="hidden"
				justifyContent="flex-end"
			>
				{activeView === 'chat' ? (
					<MessageList
						events={events}
						maxEvents={dynamicMaxEvents}
						scrollOffset={0}
					/>
				) : (
					renderView()
				)}
			</Box>

			{/* Input & Footer - Chat view only */}
			{activeView === 'chat' && (
				<Box flexDirection="column" flexShrink={0}>
					{/* Thinking Indicator */}
					{isBusy && !isInitCommand && (
						<ThinkingIndicator
							activity={currentActivity}
							startTime={busyStartTime}
							tokensIn={tokens.input}
						/>
					)}
					{isBackgroundBusy && (
						<Box marginLeft={2}>
							<Text dimColor>Background task running...</Text>
						</Box>
					)}

					{/* Interactive Prompts */}
					{pendingPrompt?.type === 'approval' && (
						<Box marginBottom={0}>
							<ApprovalPrompt
								requestId={pendingPrompt.requestId}
								context={pendingPrompt.context}
								diff={pendingPrompt.diff}
								onResolve={handlePromptResolve}
							/>
						</Box>
					)}
					{pendingPrompt?.type === 'choice' && (
						<Box marginBottom={0}>
							<ChoicePrompt
								question={pendingPrompt.question}
								options={pendingPrompt.options}
								onResolve={handlePromptResolve}
							/>
						</Box>
					)}
					{pendingPrompt?.type === 'text_input' && (
						<Box marginBottom={0}>
							<TextInputPrompt
								requestId={pendingPrompt.requestId}
								prompt={pendingPrompt.prompt}
								masked={pendingPrompt.masked}
								placeholder={pendingPrompt.placeholder}
								onResolve={handlePromptResolve}
							/>
						</Box>
					)}

					{/* Input Area */}
					<Box flexDirection="column">
						<Box paddingX={0}>
							<Text dimColor>{separatorLine}</Text>
						</Box>
						<Box paddingX={1}>
							<Text color="red" bold>{'> '}</Text>
							{renderInput()}
						</Box>
					</Box>

					{/* Command Palette (Ctrl+K) */}
					{showPalette && (
						<CommandPalette
							onSelect={(cmd) => {
								setShowPalette(false);
								setInput('');
								handleSubmit(cmd);
							}}
							onClose={() => setShowPalette(false)}
						/>
					)}

					{/* Command Popup (/ prefix) */}
					{!showPalette && <CommandPopup matches={matches} selectedIndex={selectedIndex} />}

					{/* Info Bar */}
					{matches.length === 0 && !showPalette && (
						<Box flexDirection="column">
							<Box paddingX={0}>
								<Text dimColor>{separatorLine}</Text>
							</Box>
							<Box paddingX={1} flexDirection="row" justifyContent="space-between">
								<Box>
									<Text color={MODE_STYLE[stats.mode].color}>
										{MODE_STYLE[stats.mode].icon}
									</Text>
									<Text> </Text>
									<Text bold color={MODE_STYLE[stats.mode].color}>
										{stats.mode} mode
									</Text>
									<Text dimColor> (shift+tab to cycle)</Text>
									<Text color="gray"> · </Text>
									<Text color={stats.sandbox === 'sandbox' ? 'green' : 'yellow'}>
										{stats.sandbox === 'sandbox' ? 'sandbox' : 'no sandbox'}
									</Text>
								</Box>
								<Box>
									<Text dimColor>Context left until auto-compact: </Text>
									<Text color={contextPct > 50 ? 'green' : contextPct > 20 ? 'yellow' : 'red'}>
										{contextPct}%
									</Text>
								</Box>
							</Box>
						</Box>
					)}
				</Box>
			)}
		</Box>
	);
};

const MODE_STYLE = {
	auto: { label: 'auto', icon: '\u25B6', color: 'green' as const },
	plan: { label: 'plan', icon: '\u23F8', color: 'yellow' as const },
	safe: { label: 'safe', icon: '\u23F8', color: 'red' as const }
} as const;
