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
    user: string;
    version: string;
}

export const Dashboard: React.FC = () => {
    const [columns, setColumns] = useState(process.stdout.columns || 80);
    const [state, setState] = useState<DashboardState>({
        model: 'Loading...',
        mode: 'safe',
        keyStatus: 'missing',
        sessionCost: 0,
        workspace: process.cwd().split('/').slice(-2).join('/'), // Shortened path
        user: process.env.USER || 'User',
        version: 'v0.4.0-pre-release',
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

    // Responsive: Track terminal width
    useEffect(() => {
        const onResize = () => setColumns(process.stdout.columns || 80);
        process.stdout.on('resize', onResize);
        return () => { process.stdout.off('resize', onResize); };
    }, []);

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

                {/* LEFT COLUMN: Identity & Status */}
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

                    {/* Sprite */}
                    <Box justifyContent="center" marginBottom={1}>
                        <Box flexDirection="column">
                            {SPRITE.map((line, i) => (
                                <Text key={i} color="red">{line}</Text>
                            ))}
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
                    <Box flexDirection="column" marginBottom={1}>
                        <Text bold color="white">Tips for getting started</Text>
                        <Text>✔ Run <Text color="cyan">/init</Text> to configure settings</Text>
                        <Text>✔ <Text color="cyan">Shift+Tab</Text> to toggle modes ({state.mode})</Text>
                    </Box>

                    {/* Separator */}
                    <Box marginY={0}>
                        <Text color={borderColor}>──────────────────────────────</Text>
                    </Box>

                    {/* Recent Activity (Placeholder for now) */}
                    <Box flexDirection="column" marginTop={1}>
                        <Text bold color="white">Recent activity</Text>
                        <Text dimColor>No recent activity</Text>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
