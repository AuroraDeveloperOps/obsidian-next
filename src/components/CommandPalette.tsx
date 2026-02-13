import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { COMMANDS } from '../ui/CommandPopup.js';

interface CommandPaletteProps {
	onSelect: (command: string) => void;
	onClose: () => void;
}

/**
 * CommandPalette - Fuzzy search command launcher (Ctrl+K)
 * Replaces scrolling through / commands with instant search.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ onSelect, onClose }) => {
	const [query, setQuery] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);

	const filtered = query.length === 0
		? COMMANDS
		: COMMANDS.filter((cmd) => {
			const q = query.toLowerCase();
			const name = cmd.name.toLowerCase();
			const desc = cmd.desc.toLowerCase();
			// Fuzzy: check if all chars appear in order
			if (name.includes(q) || desc.includes(q)) return true;
			let qi = 0;
			for (let i = 0; i < name.length && qi < q.length; i++) {
				if (name[i] === q[qi]) qi++;
			}
			return qi === q.length;
		});

	useEffect(() => { setSelectedIndex(0); }, [query]);

	useInput((input, key) => {
		if (key.escape) {
			onClose();
			return;
		}
		if (key.return) {
			const selected = filtered[selectedIndex];
			if (selected) {
				onSelect(selected.name);
			}
			return;
		}
		if (key.upArrow) {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
			return;
		}
		if (key.downArrow) {
			setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
			return;
		}
		if (key.backspace || key.delete) {
			setQuery((prev) => prev.slice(0, -1));
			return;
		}
		if (!key.ctrl && !key.meta && input && !key.tab) {
			setQuery((prev) => prev + input);
		}
	});

	const WINDOW = 8;
	let start = 0;
	if (selectedIndex >= WINDOW) {
		start = selectedIndex - WINDOW + 1;
	}
	const visible = filtered.slice(start, start + WINDOW);
	const width = Math.min(process.stdout.columns || 80, 60);

	return (
		<Box flexDirection="column" width={width}>
			{/* Search Input */}
			<Box paddingX={1}>
				<Text dimColor>{'─'.repeat(width - 2)}</Text>
			</Box>
			<Box paddingX={1}>
				<Text color="red" bold>{'> '}</Text>
				<Text>{query || ''}</Text>
				<Text dimColor>{query.length === 0 ? 'Search commands...' : ''}</Text>
				<Text>_</Text>
			</Box>
			<Box paddingX={1}>
				<Text dimColor>{'─'.repeat(width - 2)}</Text>
			</Box>

			{/* Results */}
			{start > 0 && (
				<Box paddingX={1}>
					<Text dimColor>{start} more above</Text>
				</Box>
			)}
			{visible.map((cmd, i) => {
				const actualIndex = start + i;
				const isSelected = actualIndex === selectedIndex;
				return (
					<Box key={cmd.name} paddingX={1}>
						<Text color={isSelected ? 'red' : 'gray'}>
							{isSelected ? '> ' : '  '}
						</Text>
						<Box minWidth={20}>
							<Text color={isSelected ? 'red' : 'white'} bold={isSelected}>
								{cmd.name}
							</Text>
						</Box>
						<Text dimColor>{cmd.desc}</Text>
					</Box>
				);
			})}
			{start + WINDOW < filtered.length && (
				<Box paddingX={1}>
					<Text dimColor>{filtered.length - start - WINDOW} more below</Text>
				</Box>
			)}

			{filtered.length === 0 && (
				<Box paddingX={1}>
					<Text dimColor>No matching commands</Text>
				</Box>
			)}

			{/* Footer hints */}
			<Box paddingX={1}>
				<Text dimColor>{'─'.repeat(width - 2)}</Text>
			</Box>
			<Box paddingX={1}>
				<Text dimColor>Arrows navigate * Enter execute * Esc close</Text>
			</Box>
		</Box>
	);
};
