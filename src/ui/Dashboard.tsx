<<<<<<< HEAD
import React from 'react';
import { Box, Text } from 'ink';

const flareAnim = ["·", "▪", "▚", "❖", "✦", "✹", "✦", "▪"];

const owlSprites = {
    idle: `▐▛█████████▜▌\n▐██▀     ▀██▌\n▐██   ▄   ██▌\n▐▙▄▄▄▄▄▄▄▄▄▟▌`,
    blink_half: `▐▛█████████▜▌\n▐██▄     ▄██▌\n▐██   ▄   ██▌\n▐▙▄▄▄▄▄▄▄▄▄▟▌`,
    blink_full: `▐▛█████████▜▌\n▐███████████▌\n▐████▄██████▌\n▐▙▄▄▄▄▄▄▄▄▄▟▌`,
    suspicious: `▐▛█████████▜▌\n▐███████████▌\n▐██▀  ▄  ▀██▌\n▐▙▄▄▄▄▄▄▄▄▄▟▌`,
    look_right: `▐▛█████████▜▌\n▐██▀      ▐█▌\n▐██   ▄   ▐█▌\n▐▙▄▄▄▄▄▄▄▄▄▟▌`,
    look_left: `▐▛█████████▜▌\n▐█▌      ▀██▌\n▐█▌   ▄   ██▌\n▐▙▄▄▄▄▄▄▄▄▄▟▌`
};

interface DashboardProps {
    username?: string;
    model?: string;
    workspace?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({
    username = 'User',
    model = 'Claude Sonnet 4.5',
    workspace = process.cwd(),
}) => {
    const [flareFrame, setFlareFrame] = React.useState(0);
    const [owlState, setOwlState] = React.useState<keyof typeof owlSprites>('idle');
    const [columns, setColumns] = React.useState(process.stdout.columns);

    // Responsive: Track terminal width
    React.useEffect(() => {
        const onResize = () => setColumns(process.stdout.columns);
=======
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { bus } from '../core/bus.js';
import { config } from '../core/config.js';
import { settings } from '../core/settings.js';
import { keyManager } from '../core/keyManager.js';
import { usage } from '../core/usage.js';
import { AgentEvent } from '../events/types.js';

// Character sprite for header
const SPRITE = [
    "▐▛█████████▜▌",
    "▐██▄     ▄██▌",
    "▐██   ▄   ██▌",
    "▐▙▄▄▄▄▄▄▄▄▄▟▌",
];

interface DashboardState {
    model: string;
    mode: 'auto' | 'plan' | 'safe';
    keyStatus: 'valid' | 'missing' | 'rotating';
    sessionCost: number;
    workspace: string;
}

export const Dashboard: React.FC = () => {
    const [columns, setColumns] = useState(process.stdout.columns || 80);
    const [state, setState] = useState<DashboardState>({
        model: 'Loading...',
        mode: 'safe',
        keyStatus: 'missing',
        sessionCost: 0,
        workspace: process.cwd(),
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

    // Subscribe to events that should trigger updates
    useEffect(() => {
        const handler = async (event: AgentEvent) => {
            // Update on relevant events
            if (
                event.type === 'done' ||
                event.type === 'tool_result' ||
                event.type === 'session_saved' ||
                event.type === 'shutdown_complete'
            ) {
                const cfg = await config.load();
                const s = await settings.load();

                setState(prev => ({
                    ...prev,
                    model: formatModelName(cfg.model),
                    mode: s.mode,
                    sessionCost: usage.getSessionCost(),
                }));
            }

            // Update key status on specific events
            if (event.type === 'thought' && event.content?.includes('API key')) {
                const hasKey = await keyManager.hasKey();
                setState(prev => ({
                    ...prev,
                    keyStatus: hasKey ? 'valid' : 'missing',
                }));
            }
        };

        bus.on('agent', handler);
        return () => {
            bus.off('agent', handler);
        };
    }, []);

    // Responsive: Track terminal width
    useEffect(() => {
        const onResize = () => setColumns(process.stdout.columns || 80);
>>>>>>> polyoxy-dev/v0.4.0-mcp
        process.stdout.on('resize', onResize);
        return () => {
            process.stdout.off('resize', onResize);
        };
    }, []);

<<<<<<< HEAD
    // Tech Flare Animation Loop
    React.useEffect(() => {
        const interval = setInterval(() => {
            setFlareFrame((prev) => (prev + 1) % flareAnim.length);
        }, 100);
        return () => clearInterval(interval);
    }, []);

    // Owl Blink Logic
    React.useEffect(() => {
        let isActive = true;
        const loop = async () => {
            while (isActive) {
                const delay = Math.random() * 5000 + 3000;
                await new Promise(r => setTimeout(r, delay));
                if (!isActive) break;

                setOwlState('blink_half');
                await new Promise(r => setTimeout(r, 50));
                setOwlState('blink_full');
                await new Promise(r => setTimeout(r, 100));
                setOwlState('blink_half');
                await new Promise(r => setTimeout(r, 50));
                setOwlState('idle');
            }
        };
        loop();

        return () => { isActive = false; };
    }, []);

    const showRightColumn = columns >= 100;
=======
    const showExtended = columns >= 80;
    const showFull = columns >= 100;

    // Format model name for display
    function formatModelName(model: string): string {
        if (model.includes('sonnet')) return 'Sonnet 4.5';
        if (model.includes('haiku')) return 'Haiku 4.5';
        if (model.includes('opus')) return 'Opus 4.5';
        return model.split('-').slice(0, 2).join(' ');
    }

    // Mode color
    const modeColor = state.mode === 'auto' ? 'green' :
                      state.mode === 'plan' ? 'yellow' : 'white';

    // Key status color and icon
    const keyIcon = state.keyStatus === 'valid' ? '●' :
                    state.keyStatus === 'rotating' ? '○' : '○';
    const keyColor = state.keyStatus === 'valid' ? 'green' :
                     state.keyStatus === 'rotating' ? 'yellow' : 'red';
>>>>>>> polyoxy-dev/v0.4.0-mcp

    return (
        <Box
            borderStyle="round"
            borderColor="red"
<<<<<<< HEAD
            flexDirection="row"
            paddingX={1}
            paddingY={0}
        >
            {/* Left Column: Welcome & Owl */}
            <Box flexDirection="column" width={showRightColumn ? "60%" : "100%"} paddingRight={showRightColumn ? 1 : 0}>
                <Box justifyContent="center" marginBottom={1}>
                    <Text bold color="white">Welcome back, {username}!</Text>
                </Box>

                <Box justifyContent="center" marginBottom={1}>
                    <Text color="red">{owlSprites[owlState]}</Text>
                </Box>

                <Box flexDirection="column" alignItems="center">
                    <Text color="white">
                        {model} <Text color="yellow">{flareAnim[flareFrame]}</Text> Obsidian Next
                    </Text>
                    <Text color="gray">{workspace}</Text>
                </Box>
            </Box>

            {/* Vertical Divider - Only show if Right Column is visible */}
            {showRightColumn && (
                <Box borderStyle="single" borderTop={false} borderBottom={false} borderLeft={false} borderColor="red" marginX={1} />
            )}

            {/* Right Column: Commands & Tips - Hide on small screens */}
            {showRightColumn && (
                <Box flexDirection="column" width="40%" paddingLeft={1}>
                    <Box flexDirection="column" marginBottom={1}>
                        <Text bold color="red">Commands</Text>
                        <Text color="white"><Text bold>/help</Text>  Show all commands</Text>
                        <Text color="white"><Text bold>/tool</Text>  Execute tools</Text>
                        <Text color="white"><Text bold>/clear</Text> Clear history</Text>
                    </Box>

                    <Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderColor="red" marginBottom={1} />

                    <Box flexDirection="column">
                        <Text bold color="red">Quick Start</Text>
                        <Text color="gray">Ask me to read, edit, or</Text>
                        <Text color="gray">run commands in your code.</Text>
                    </Box>
                </Box>
            )}
=======
            flexDirection="column"
            paddingX={1}
            paddingY={0}
        >
            {/* Header with Sprite */}
            <Box flexDirection="row">
                {/* Left: Character Sprite */}
                <Box flexDirection="column" marginRight={2}>
                    {SPRITE.map((line, i) => (
                        <Text key={i} color="red">{line}</Text>
                    ))}
                </Box>

                {/* Right: Info Panel */}
                <Box flexDirection="column" justifyContent="center" flexGrow={1}>
                    {/* Title Row */}
                    <Box>
                        <Text bold color="red">OBSIDIAN</Text>
                        <Text color="gray"> </Text>
                        <Text color={modeColor}>[{state.mode.toUpperCase()}]</Text>
                    </Box>

                    {/* Model Row */}
                    <Box>
                        <Text color="gray">Model: </Text>
                        <Text color="white" bold>{state.model}</Text>
                    </Box>

                    {/* Status Row */}
                    <Box>
                        <Text color={keyColor}>{keyIcon}</Text>
                        <Text color="gray"> Key </Text>
                        {showExtended && (
                            <>
                                <Text color="gray">| </Text>
                                <Text color="green">${state.sessionCost.toFixed(4)}</Text>
                            </>
                        )}
                    </Box>

                    {/* Help Row */}
                    {showFull && (
                        <Text color="gray" dimColor>
                            Shift+Tab: mode | /help: commands
                        </Text>
                    )}
                </Box>
            </Box>
>>>>>>> polyoxy-dev/v0.4.0-mcp
        </Box>
    );
};
