import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { bus } from '../core/bus.js';
import { config } from '../core/config.js';
import { settings } from '../core/settings.js';
import { keyManager } from '../core/keyManager.js';
import { usage } from '../core/usage.js';
import { AgentEvent } from '../events/types.js';

const flareAnim = ["·", "▪", "▚", "❖", "✦", "✹", "✦", "▪"];

interface DashboardState {
    model: string;
    mode: 'auto' | 'plan' | 'safe';
    keyStatus: 'valid' | 'missing' | 'rotating';
    sessionCost: number;
    workspace: string;
}

export const Dashboard: React.FC = () => {
    const [flareFrame, setFlareFrame] = useState(0);
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
        process.stdout.on('resize', onResize);
        return () => {
            process.stdout.off('resize', onResize);
        };
    }, []);

    // Flare animation
    useEffect(() => {
        const interval = setInterval(() => {
            setFlareFrame((prev) => (prev + 1) % flareAnim.length);
        }, 100);
        return () => clearInterval(interval);
    }, []);

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

    return (
        <Box
            borderStyle="round"
            borderColor="red"
            flexDirection="column"
            paddingX={1}
            paddingY={0}
        >
            {/* Main Header Row */}
            <Box justifyContent="space-between" flexDirection="row">
                {/* Left: Title and Status */}
                <Box>
                    <Text bold color="red">OBSIDIAN</Text>
                    <Text color="gray"> </Text>
                    <Text color="yellow">{flareAnim[flareFrame]}</Text>
                    <Text color="gray"> </Text>
                    <Text color={modeColor}>[{state.mode.toUpperCase()}]</Text>
                </Box>

                {/* Center: Model */}
                <Box>
                    <Text color="gray">Model: </Text>
                    <Text color="white" bold>{state.model}</Text>
                </Box>

                {/* Right: Key Status and Cost */}
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
            </Box>

            {/* Extended Info Row (on wider terminals) */}
            {showFull && (
                <Box justifyContent="space-between" marginTop={0}>
                    <Text color="gray" dimColor>
                        {state.workspace.length > 50
                            ? '...' + state.workspace.slice(-47)
                            : state.workspace}
                    </Text>
                    <Text color="gray" dimColor>
                        Shift+Tab: mode | /help: commands | /settings: menu
                    </Text>
                </Box>
            )}
        </Box>
    );
};
