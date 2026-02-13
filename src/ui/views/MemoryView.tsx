import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { memory } from '../../core/memory.js';
import { bus } from '../../core/bus.js';

interface MemoryViewProps {
	onClose: () => void;
}

interface MemoryItem {
	id: number;
	type: string;
	content: string;
	created_at: string;
}

export const MemoryView: React.FC<MemoryViewProps> = ({ onClose }) => {
	const [stats, setStats] = useState<any>(null);
	const [items, setItems] = useState<MemoryItem[]>([]);
	const [selected, setSelected] = useState(0);
	const [view, setView] = useState<'stats' | 'list'>('stats');

	useEffect(() => {
		const load = async () => {
			const s = await memory.getStats();
			setStats(s);
			try {
				const all = await memory.search('', 20);
				setItems(all);
			} catch {
				setItems([]);
			}
		};
		load();
	}, []);

	useInput(async (input, key) => {
		if (key.escape) {
			if (view === 'list') {
				setView('stats');
				return;
			}
			onClose();
			return;
		}

		if (view === 'stats') {
			if (input === 'b' || input === 'B') {
				setView('list');
			}
			if (input === 'e' || input === 'E') {
				try {
					const path = await memory.exportToMarkdown();
					bus.emitAgent({ type: 'thought', content: `Memory exported to: ${path}` });
				} catch (err: any) {
					bus.emitAgent({ type: 'error', message: `Export failed: ${err.message}` });
				}
				onClose();
			}
		}

		if (view === 'list') {
			if (key.upArrow) setSelected((p) => Math.max(0, p - 1));
			if (key.downArrow) setSelected((p) => Math.min(items.length - 1, p + 1));
		}
	});

	if (!stats) {
		return (
			<Box padding={1}>
				<Text dimColor>Loading memory...</Text>
			</Box>
		);
	}

	if (view === 'list') {
		const visible = items.slice(Math.max(0, selected - 5), selected + 10);
		const offset = Math.max(0, selected - 5);
		return (
			<Box flexDirection="column" paddingX={1} width="100%">
				<Box marginBottom={1}>
					<Text bold color="white">[ Memory - Browse ]</Text>
				</Box>

				{visible.map((item, i) => {
					const idx = offset + i;
					const isSelected = idx === selected;
					return (
						<Box key={item.id} flexDirection="column">
							<Box>
								<Text color={isSelected ? 'white' : 'gray'}>
									{isSelected ? '> ' : '  '}
								</Text>
								<Text color="cyan">[{item.type}]</Text>
								<Text dimColor> {item.content.slice(0, 60)}{item.content.length > 60 ? '...' : ''}</Text>
							</Box>
							{isSelected && (
								<Box marginLeft={4} marginBottom={1}>
									<Text dimColor wrap="wrap">{item.content}</Text>
								</Box>
							)}
						</Box>
					);
				})}

				<Box marginTop={1}>
					<Text dimColor>Arrows navigate * Esc back</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" paddingX={1} width="100%">
			<Box marginBottom={1}>
				<Text bold color="white">[ Agent Memory ]</Text>
			</Box>

			<Text>Total items: <Text bold>{stats.total}</Text></Text>
			<Text> </Text>

			<Text bold color="gray">By Type</Text>
			{Object.entries(stats.byType).map(([type, count]) => (
				<Text key={type}>   {type.padEnd(15)} <Text dimColor>{String(count)}</Text></Text>
			))}

			<Box marginTop={1} flexDirection="column">
				<Text>[b] Browse memories</Text>
				<Text>[e] Export to MEMORY.md</Text>
			</Box>

			<Box marginTop={1}>
				<Text dimColor>Esc to close</Text>
			</Box>
		</Box>
	);
};
