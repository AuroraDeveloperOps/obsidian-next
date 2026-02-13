import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { undo } from '../../core/undo.js';
import { bus } from '../../core/bus.js';

interface UndoViewProps {
	onClose: () => void;
}

export const UndoView: React.FC<UndoViewProps> = ({ onClose }) => {
	const [history, setHistory] = useState<any[]>([]);
	const [selected, setSelected] = useState(0);

	useEffect(() => {
		setHistory(undo.getHistory(20));
	}, []);

	useInput(async (input, key) => {
		if (key.escape) {
			onClose();
			return;
		}
		if (key.upArrow) setSelected((p) => Math.max(0, p - 1));
		if (key.downArrow) setSelected((p) => Math.min(history.length - 1, p + 1));

		// Undo selected item
		if (key.return && history.length > 0) {
			const result = await undo.undo(1);
			if (result.success) {
				bus.emitAgent({ type: 'thought', content: result.message });
			} else {
				bus.emitAgent({ type: 'error', message: result.message });
			}
			// Refresh
			setHistory(undo.getHistory(20));
			setSelected(0);
		}
	});

	if (history.length === 0) {
		return (
			<Box flexDirection="column" paddingX={1}>
				<Box marginBottom={1}>
					<Text bold color="white">[ Undo History ]</Text>
				</Box>
				<Text dimColor>No changes to undo.</Text>
				<Box marginTop={1}>
					<Text dimColor>Esc to close</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" paddingX={1} width="100%">
			<Box marginBottom={1}>
				<Text bold color="white">[ Undo History ]</Text>
				<Text dimColor>  {history.length} changes</Text>
			</Box>

			{history.map((change, i) => {
				const op = change.operation === 'create' ? '+' : change.operation === 'delete' ? '-' : '~';
				const opColor = change.operation === 'create' ? 'green' : change.operation === 'delete' ? 'red' : 'yellow';
				return (
					<Box key={i}>
						<Text color={i === selected ? 'white' : 'gray'}>
							{i === selected ? '> ' : '  '}
						</Text>
						<Text color={opColor as any}>[{op}]</Text>
						<Text bold={i === selected}> {change.filePath}</Text>
					</Box>
				);
			})}

			<Box marginTop={1}>
				<Text dimColor>Enter to undo * Esc to close</Text>
			</Box>
		</Box>
	);
};
