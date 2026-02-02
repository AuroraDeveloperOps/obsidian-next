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
    "▐▛█████████▜▌",
    "▐██▄     ▄██▌",
    "▐██   ▄   ██▌",
    "▐▙▄▄▄▄▄▄▄▄▄▟▌",
];

// Sleeping/Flying Owl sprite frames
const OWL_FRAMES = {
    sleep: [
        "    ,___,    ",
        "    {O,O}    ",
        "    /)__)    ",
        "     \"\"\"     "
    ],
    flap: [
        "    ,___,    ",
        "   <{O,O}>   ",
        "    /)__)    ",
        "     \"\"\"     "
    ]
};

interface DashboardState {
    model: string;
    mode: 'auto' | 'plan' | 'safe';
    keyStatus: 'valid' | 'missing' | 'rotating';
    sessionCost: number;
    workspace: string;
    user: string;
    version: string;
}

interface DashboardProps {
    isBusy?: boolean;
    isBackgroundBusy?: boolean;
    isIdle?: boolean;
    isSleep?: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
    isBusy = false,
    isBackgroundBusy = false,
    isIdle = false,
    isSleep = false
}) => {
    const [columns, setColumns] = useState(process.stdout.columns || 80);
    const [state, setState] = useState<DashboardState>({
        model: 'Loading...',
        mode: 'safe',
        keyStatus: 'missing',
        sessionCost: 0,
        workspace: process.cwd().split('/').slice(-2).join('/'), // Shortened path
        user: process.env.USER || 'User',
        version: 'v0.4.2',
    });

    // Load initial state
    useEffect(() => {
        const loadState = async () => {
            const cfg = await config.load();
            const s = await settings.load();
            const hasKey = await keyManager.hasKey();

            setState(prev => ({
                ...prev,
                model: formatModelName(cfg.model),
                mode: s.mode,
                keyStatus: hasKey ? 'valid' : 'missing',
                sessionCost: usage.getSessionCost(),
            }));
        };

        loadState();
    }, []);

    // Subscribe to events
    useEffect(() => {
        const handler = async (event: AgentEvent) => {
            if (['done', 'tool_result', 'session_saved', 'shutdown_complete'].includes(event.type)) {
                const cfg = await config.load();
                const s = await settings.load();
                setState(prev => ({
                    ...prev,
                    model: formatModelName(cfg.model),
                    mode: s.mode,
                    sessionCost: usage.getSessionCost(),
                }));
            }
            if (event.type === 'thought') {
                if (event.content?.includes('API key')) {
                    const hasKey = await keyManager.hasKey();
                    setState(prev => ({ ...prev, keyStatus: hasKey ? 'valid' : 'missing' }));
                }
                if (event.content?.startsWith('Mode')) {
                    const s = await settings.load();
                    setState(prev => ({ ...prev, mode: s.mode }));
                }
            }
        };

        bus.on('agent', handler);
        return () => { bus.off('agent', handler); };
    }, []);

    // Responsive: Track terminal width using Ink's hook
    const { stdout } = useStdout();

    useEffect(() => {
        const onResize = () => setColumns(stdout.columns);
        stdout.on('resize', onResize);
        return () => { stdout.off('resize', onResize); };
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

    // Sprite Animation Loop
    useEffect(() => {
        let interval = 3000; // Idle
        if (isBusy) interval = 100;
        else if (isBackgroundBusy) interval = 300;
        else if (isIdle && !isSleep) interval = 200; // Faster flap while flying

        const timer = setInterval(() => {
            setFrame(f => (f + 1) % 120);
        }, interval);
        return () => clearInterval(timer);
    }, [isBusy, isBackgroundBusy, isIdle, isSleep]);

    // Spatial Movement Logic (Gliding/Flying)
    useEffect(() => {
        if (!isIdle || isBusy || isBackgroundBusy) {
            setTargetX(0); // Return to center station
        } else if (isIdle && frame % 40 === 0) {
            // Randomly move while idle - wider range
            const maxTravel = Math.floor(columns / 2) - 20;
            // Move between -maxTravel and +maxTravel for a wide sweep
            setTargetX(Math.floor(Math.random() * maxTravel * 2) - maxTravel);
        }
    }, [isIdle, isBusy, isBackgroundBusy, frame, columns]);

    // Smooth movement interpolation
    useEffect(() => {
        const moveTimer = setInterval(() => {
            setSpriteX(current => {
                const diff = targetX - current;
                if (Math.abs(diff) < 0.1) return targetX;
                // Fluid "gliding" speed
                const speed = targetX === 0 ? 0.15 : 0.08;
                return current + diff * speed;
            });
        }, 50);
        return () => clearInterval(moveTimer);
    }, [targetX]);

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
                <Text color="red" bold>Obsidian Next </Text>
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
                    borderStyle={isNarrow ? undefined : "single"}
                    borderTop={false}
                    borderBottom={false}
                    borderLeft={false}
                    borderRight={!isNarrow}
                    borderColor={borderColor}
                >
                    {/* Welcome */}
                    <Box justifyContent="center" marginBottom={1}>
                        <Text>Welcome back </Text>
                        <Text bold color="white">{state.user}</Text>
                        <Text>!</Text>
                    </Box>

                    {/* Sprite with Animation Area (The Stage) */}
                    <Box height={6} alignItems="flex-start" width="100%" justifyContent="center">
                        <Box marginLeft={Math.floor(spriteX)}>
                            <Box flexDirection="column">
                                {(isIdle || isSleep ? (frame % 4 < 2 ? OWL_FRAMES.sleep : OWL_FRAMES.flap) : SPRITE).map((line, i) => {
                                    // Animation Logic
                                    const isScanline = (isBusy || isBackgroundBusy) && (frame % 30 === i);
                                    const isGlitch = isBusy && (frame % 30 === 25) && i === 2;

                                    let color = "red";
                                    if (isSleep) color = "gray";
                                    else if (isIdle && !isBackgroundBusy) color = "gray";

                                    if (isScanline) color = "white";
                                    if (isGlitch) color = "magenta";

                                    if (isBackgroundBusy && !isBusy && !isScanline && !isGlitch) {
                                        color = frame % 2 === 0 ? "cyan" : "blue";
                                    }

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
                                            <Text color={color} bold={isScanline}>{line}</Text>
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
                <Box flexDirection="column" width={rightWidth} paddingLeft={isNarrow ? 0 : 1}>

                    {/* Tips */}
                    <Box flexDirection="column" marginBottom={0}>
                        <Text>Tips for getting started</Text>
                        <Text>✔ Run <Text color="cyan">/init</Text> to configure settings</Text>
                        <Text>✔ <Text color="cyan">Shift+Tab</Text> to toggle modes ({state.mode})</Text>
                    </Box>

                    {/* Separator */}
                    <Box marginY={1}>
                        <Text color="gray">────────────────────────────────────────────────────────</Text>
                    </Box>

                    {/* Recent Activity */}
                    <Box flexDirection="column">
                        <Text>Recent activity</Text>
                        <Text dimColor>No recent activity</Text>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
