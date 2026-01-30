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
        process.stdout.on('resize', onResize);
        return () => {
            process.stdout.off('resize', onResize);
        };
    }, []);

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

    return (
        <Box
            borderStyle="round"
            borderColor="red"
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
        </Box>
    );
};
