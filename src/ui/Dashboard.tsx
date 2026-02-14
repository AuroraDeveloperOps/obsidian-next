import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { bus } from '../core/bus.js';
import { config } from '../core/config.js';
import { settings } from '../core/settings.js';
import { keyManager } from '../core/keyManager.js';
import { usage } from '../core/usage.js';
import { AgentEvent } from '../events/types.js';

// Character sprite for header (Terminal/Active)
const SPRITE = [
	' ,▞▀▀▀▀▀▚,',
	'▗▌  ███  ▐▖',
	'▝▌  ███  ▐▘',
	" '▚▄▄▄▄▄▞'"
];

// Sleeping/Flying Owl sprite frames
const OWL_FRAMES = {
	sleep: ['    ,___,    ', '    {O,O}    ', '    /)__)    ', '     """     '],
	flap: ['    ,___,    ', '   <{O,O}>   ', '    /)__)    ', '     """     ']
};

interface OwlSettings {
	enabled: boolean;
	flyWhenIdle: boolean;
	idleTimeout: number;
	sleepTimeout: number;
}

interface DashboardState {
	model: string;
	mode: 'auto' | 'plan' | 'safe';
	keyStatus: 'valid' | 'missing' | 'rotating';
	sessionCost: number;
	workspace: string;
	user: string;
	version: string;
	owlSettings: OwlSettings;
}

interface DashboardProps {
	isBusy?: boolean;
	isBackgroundBusy?: boolean;
	isIdle?: boolean;
	isSleep?: boolean;
	latestActivity?: { content: string; color: string };
}

const DashboardComponent: React.FC<DashboardProps> = ({
	isBusy = false,
	isBackgroundBusy = false,
	isIdle = false,
	isSleep = false,
	latestActivity
}) => {
	const [columns, setColumns] = useState(process.stdout.columns || 80);
	const [state, setState] = useState<DashboardState>({
		model: 'Loading...',
		mode: 'safe',
		keyStatus: 'missing',
		sessionCost: 0,
		workspace: 'Loading...',
		user: process.env.USER || 'User',
		version: 'v...',
		owlSettings: {
			enabled: false,
			flyWhenIdle: false,
			idleTimeout: 60000,
			sleepTimeout: 300000
		}
	});

	// Load initial state
	useEffect(() => {
		const loadState = async () => {
			const cfg = await config.load();
			const s = await settings.load();
			const hasKey = await keyManager.hasKey();
			const ver = await config.getVersion();

			// Get owl settings with defaults
			const owlSettings = s.ui?.owlAnimation || {
				enabled: false,
				flyWhenIdle: false,
				idleTimeout: 60000,
				sleepTimeout: 300000
			};
			
			const conf = cfg as any;
			let displayModel = cfg.model;
			if (conf.provider === 'ollama') {
				displayModel = conf.ollama?.models?.chat || 'Unknown Ollama Model';
			} else if (conf.provider === 'moe') {
				displayModel = 'MoE (Auto)';
			}

			setState((prev) => ({
				...prev,
				model: formatModelName(displayModel),
				mode: s.mode,
				keyStatus: hasKey ? 'valid' : 'missing',
				sessionCost: usage.getSessionCost(),
				workspace: cfg.workspaceRoot.split('/').slice(-2).join('/'),
				version: ver.startsWith('v') ? ver : `v${ver}`,
				owlSettings
			}));
		};

		loadState();
	}, []);

	// Subscribe to events
	useEffect(() => {
		const handler = async (event: AgentEvent) => {
			if (
				['done', 'tool_result', 'session_saved', 'shutdown_complete'].includes(
					event.type
				)
			) {
				const cfg = await config.load();
				const s = await settings.load();
				const owlSettings = s.ui?.owlAnimation || {
					enabled: false,
					flyWhenIdle: false,
					idleTimeout: 60000,
					sleepTimeout: 300000
				};
				
				const conf = cfg as any;
				let displayModel = cfg.model;
				if (conf.provider === 'ollama') {
					displayModel = conf.ollama?.models?.chat || 'Unknown Ollama Model';
				} else if (conf.provider === 'moe') {
					displayModel = 'MoE (Auto)';
				}
				
				setState((prev) => ({
					...prev,
					model: formatModelName(displayModel),
					mode: s.mode,
					sessionCost: usage.getSessionCost(),
					workspace: cfg.workspaceRoot.split('/').slice(-2).join('/'),
					owlSettings
				}));
			}
			if (event.type === 'thought') {
				if (event.content?.includes('API key')) {
					const hasKey = await keyManager.hasKey();
					setState((prev) => ({
						...prev,
						keyStatus: hasKey ? 'valid' : 'missing'
					}));
				}
				if (event.content?.startsWith('Mode')) {
					const s = await settings.load();
					setState((prev) => ({ ...prev, mode: s.mode }));
				}
			}
		};

		bus.on('agent', handler);
		return () => {
			bus.off('agent', handler);
		};
	}, []);

	// Responsive: Track terminal width using Ink's hook
	const { stdout } = useStdout();

	useEffect(() => {
		const onResize = () => setColumns(stdout.columns);
		stdout.on('resize', onResize);
		return () => {
			stdout.off('resize', onResize);
		};
	}, [stdout]);

	// Format model name
	function formatModelName(model: string): string {
		if (model.includes('sonnet')) return 'Sonnet 4.5';
		if (model.includes('haiku')) return 'Haiku 4.5';
		if (model.includes('opus')) return 'Opus 4.5';
		return model.split('-').slice(0, 2).join(' ');
	}

	// Colors
	const borderColor = 'gray';

	// Responsive Layout
	const isNarrow = columns < 100;
	const leftWidth = isNarrow ? '100%' : '50%';
	const rightWidth = isNarrow ? '100%' : '50%';

	// Animation State
	const [frame, setFrame] = useState(0);
	const [spriteX, setSpriteX] = useState(0);
	const [targetX, setTargetX] = useState(0);

	// Sprite Animation Loop (only when animations enabled)
	useEffect(() => {
		if (!state.owlSettings.enabled) return;

		// Much slower animations to prevent flickering
		let interval = 3000; // Idle
		if (isBusy)
			interval = 1000; // Slowed down from 100ms
		else if (isBackgroundBusy)
			interval = 1000; // Slowed down from 300ms
		else if (isIdle && !isSleep) interval = 500; // Slowed down from 200ms

		const timer = setInterval(() => {
			setFrame((f) => (f + 1) % 120);
		}, interval);
		return () => clearInterval(timer);
	}, [isBusy, isBackgroundBusy, isIdle, isSleep, state.owlSettings.enabled]);

	// Spatial Movement Logic (Gliding/Flying) - only when animations enabled
	useEffect(() => {
		if (!state.owlSettings.enabled) {
			setTargetX(0);
			setSpriteX(0);
			return;
		}
		if (!isIdle || isBusy || isBackgroundBusy) {
			setTargetX(0); // Return to center station
		} else if (isIdle && state.owlSettings.flyWhenIdle && frame % 40 === 0) {
			// Randomly move while idle - wider range (only if owl flying is enabled)
			const maxTravel = Math.floor(columns / 2) - 20;
			// Move between -maxTravel and +maxTravel for a wide sweep
			setTargetX(Math.floor(Math.random() * maxTravel * 2) - maxTravel);
		} else if (!state.owlSettings.flyWhenIdle) {
			setTargetX(0); // Stay centered if flying is disabled
		}
	}, [
		isIdle,
		isBusy,
		isBackgroundBusy,
		frame,
		columns,
		state.owlSettings.enabled,
		state.owlSettings.flyWhenIdle
	]);

	// Smooth movement interpolation - only when animations enabled
	useEffect(() => {
		if (!state.owlSettings.enabled) return;

		const moveTimer = setInterval(() => {
			setSpriteX((current) => {
				const diff = targetX - current;
				if (Math.abs(diff) < 0.1) return targetX;
				// Fluid "gliding" speed
				const speed = targetX === 0 ? 0.15 : 0.08;
				return current + diff * speed;
			});
		}, 200); // Slowed from 50ms to 200ms to reduce re-renders
		return () => clearInterval(moveTimer);
	}, [targetX, state.owlSettings.enabled]);

	return (
		<Box
			borderStyle="round"
			borderColor={borderColor}
			flexDirection="column"
			paddingX={0}
			paddingY={0}
		>
			{/* Title Bar */}
			<Box
				borderStyle="single"
				borderTop={false}
				borderLeft={false}
				borderRight={false}
				borderBottom={true}
				borderColor={borderColor}
				paddingX={2}
			>
				<Text color="red" bold>
					Obsidian Next{' '}
				</Text>
				<Text color="gray">{state.version}</Text>
			</Box>

			{/* Content Area */}
			<Box flexDirection={isNarrow ? 'column' : 'row'} padding={1}>
				{/* LEFT COLUMN: Stage & Identity */}
				<Box
					flexDirection="column"
					width={leftWidth}
					paddingRight={isNarrow ? 0 : 1}
					marginBottom={isNarrow ? 1 : 0}
					borderStyle={isNarrow ? undefined : 'single'}
					borderTop={false}
					borderBottom={false}
					borderLeft={false}
					borderRight={!isNarrow}
					borderColor={borderColor}
				>
					{/* Welcome */}
					<Box justifyContent="center" marginBottom={1}>
						<Text>Welcome back </Text>
						<Text bold color="white">
							{state.user}
						</Text>
						<Text>!</Text>
					</Box>

					{/* Sprite with Animation Area (The Stage) */}
					<Box
						height={6}
						alignItems="flex-start"
						width="100%"
						justifyContent="center"
					>
						<Box marginLeft={Math.floor(spriteX)}>
							<Box flexDirection="column">
								{(() => {
									const animEnabled = state.owlSettings.enabled;
									// Determine which sprite to show based on settings
									const showOwl = animEnabled && (isIdle || isSleep);
									const owlFrame =
										frame % 4 < 2 ? OWL_FRAMES.sleep : OWL_FRAMES.flap;
									return showOwl ? owlFrame : SPRITE;
								})().map((line, i) => {
									const animEnabled = state.owlSettings.enabled;

									// Static display when animations are off
									if (!animEnabled) {
										return (
											<Box key={i}>
												<Text color="red">{line}</Text>
											</Box>
										);
									}

									// Animation Logic (simplified - no flickering)
									const showOwl = animEnabled && (isIdle || isSleep);

									let color = 'red';
									// Only turn grey for owl mode, keep red for main logo
									if (showOwl && isSleep) color = 'gray';
									else if (showOwl && isIdle && !isBackgroundBusy)
										color = 'gray';

									// Subtle activity indicators (no flashing)
									if (isBusy)
										color = 'red'; // Keep red, no glitch
									else if (isBackgroundBusy) color = 'cyan'; // Solid cyan, no cycling

									// Breathing/Flying Vertical Offset
									const isMoving = Math.abs(spriteX - targetX) > 1;
									const isFlapFrame = (isIdle || isSleep) && frame % 4 >= 2;

									// Vertical bobbing while flying or breathing
									let yOffset = 0;
									if (isIdle || isSleep) {
										if (isMoving) {
											// "Fly" up on flap frames
											yOffset = isFlapFrame ? -1 : 0;
										} else {
											// Breathe/Rest bob
											yOffset = frame % 20 > 10 ? 0.3 : 0;
										}
									}

									return (
										<Box key={i} marginTop={Math.max(0, Math.floor(yOffset))}>
											<Text color={color} bold={false}>
												{line}
											</Text>
										</Box>
									);
								})}
							</Box>
						</Box>
					</Box>

					{/* Metadata */}
					<Box flexDirection="column" alignItems="center">
						<Text dimColor>{state.model} · Obsidian Pro</Text>
						<Text dimColor>~/{state.workspace}</Text>
					</Box>
				</Box>

				{/* RIGHT COLUMN: Tips & Activity */}
				<Box
					flexDirection="column"
					width={rightWidth}
					paddingLeft={isNarrow ? 0 : 1}
				>
					{/* Tips */}
					<Box flexDirection="column" marginBottom={0}>
						<Text>Tips for getting started</Text>
						<Text>
							✔ Run <Text color="cyan">/init</Text> to configure settings
						</Text>
						<Text>
							✔ <Text color="cyan">Shift+Tab</Text> to toggle modes (
							{state.mode})
						</Text>
					</Box>

					{/* Separator */}
					<Box marginY={1}>
						<Text color="gray">
							────────────────────────────────────────────────────────
						</Text>
					</Box>

					{/* Recent Activity */}
					<Box flexDirection="column">
						<Text>Recent activity</Text>
						{latestActivity ? (
							<Text color={latestActivity.color as any}>
								{latestActivity.content.length > 60
									? latestActivity.content.slice(0, 57) + '...'
									: latestActivity.content}
							</Text>
						) : (
							<Text dimColor>No recent activity</Text>
						)}
					</Box>
				</Box>
			</Box>
		</Box>
	);
};

// Memoize Dashboard to prevent unnecessary re-renders when events change
export const Dashboard = React.memo(DashboardComponent);
