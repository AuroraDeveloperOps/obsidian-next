import React from 'react';
import { Box, Text } from 'ink';

export const COMMANDS = [
	{ name: '/help', desc: 'Show available commands', isView: true },
	{ name: '/init', desc: 'Initialize configuration', isView: true },
	{ name: '/settings', desc: 'View/edit settings', isView: true },
	{ name: '/models', desc: 'Select AI model', isView: true },
	{ name: '/mode', desc: 'Set mode (auto/plan/safe)', isView: true },
	{ name: '/sandbox', desc: 'Sandbox configuration', isView: true },
	{ name: '/status', desc: 'Show system status', isView: true },
	{ name: '/context', desc: 'Show context & token usage', isView: true },
	{ name: '/memory', desc: 'Manage agent memory', isView: true },
	{ name: '/tool', desc: 'View/execute tools', isView: true },
	{ name: '/diff', desc: 'View file changes', isView: true },
	{ name: '/undo', desc: 'Undo file changes', isView: true },
	{ name: '/pilot', desc: 'Computer Use mode', isView: true },
	{ name: '/schedule', desc: 'Schedule background tasks', isView: true },
	{ name: '/scheduled_tasks', desc: 'View scheduled tasks', isView: true },
	{ name: '/task', desc: 'View current task', isView: true },
	{ name: '/doctor', desc: 'Run diagnostics', isView: true },
	{ name: '/mcp', desc: 'Model Context Protocol', isView: true },
	{ name: '/resume', desc: 'Restore saved session', isView: true },
	{ name: '/ollama', desc: 'Ollama model registry', isView: true },
	{ name: '/skills', desc: 'Skills store - browse & manage', isView: true },
	{ name: '/clear', desc: 'Clear conversation' },
	{ name: '/exit', desc: 'Save session and exit' },
];

interface CommandPopupProps {
	matches: typeof COMMANDS;
	selectedIndex: number;
}

export const CommandPopup = ({ matches, selectedIndex }: CommandPopupProps) => {
	if (matches.length === 0) return null;

	const WINDOW_SIZE = 5;
	let startIndex = 0;
	if (selectedIndex >= WINDOW_SIZE) {
		startIndex = selectedIndex - WINDOW_SIZE + 1;
	}

	const visibleMatches = matches.slice(startIndex, startIndex + WINDOW_SIZE);
	const hasMore = startIndex + WINDOW_SIZE < matches.length;
	const hasLess = startIndex > 0;

	return (
		<Box flexDirection="column" paddingX={0} marginTop={0} marginBottom={0} width="100%">
			{hasLess && (
				<Text color="gray" dimColor> {startIndex} more above</Text>
			)}

			{visibleMatches.map((cmd, i) => {
				const actualIndex = startIndex + i;
				const isSelected = actualIndex === selectedIndex;

				return (
					<Box key={cmd.name} flexDirection="row">
						<Box minWidth={18}>
							<Text color={isSelected ? 'red' : 'gray'}>
								{isSelected ? '> ' : '  '}
							</Text>
							<Text color={isSelected ? 'red' : 'white'} bold={isSelected}>
								{cmd.name}
							</Text>
						</Box>
						<Text color="gray">{cmd.desc}</Text>
					</Box>
				);
			})}

			{hasMore && (
				<Text color="gray" dimColor> {matches.length - startIndex - WINDOW_SIZE} more below</Text>
			)}

			<Box marginTop={0}>
				<Text color="gray" dimColor>
					Arrows navigate * Enter execute * Tab complete * Esc cancel
				</Text>
			</Box>
		</Box>
	);
};
