import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { agent } from '../../core/agent.js';
import { context } from '../../core/context.js';

interface ModeSelectViewProps {
	onClose: () => void;
}

const MODES = [
	{ key: 'safe', label: 'Safe', color: 'red' as const, desc: 'Read ops auto-approve, write/exec require approval (default)' },
	{ key: 'plan', label: 'Plan', color: 'yellow' as const, desc: 'Read-only planning, approval required before execution' },
	{ key: 'auto', label: 'Auto', color: 'green' as const, desc: 'Execute all tools without confirmation (use with caution)' }
];

export const ModeSelectView: React.FC<ModeSelectViewProps> = ({ onClose }) => {
	const [selected, setSelected] = useState(() => {
		const current = context.getMode();
		return MODES.findIndex((m) => m.key === current);
	});

	useInput(async (_, key) => {
		if (key.escape) {
			onClose();
			return;
		}
		if (key.upArrow) {
			setSelected((prev) => (prev > 0 ? prev - 1 : MODES.length - 1));
		}
		if (key.downArrow) {
			setSelected((prev) => (prev < MODES.length - 1 ? prev + 1 : 0));
		}
		if (key.return) {
			const mode = MODES[selected].key as 'auto' | 'plan' | 'safe';
			await agent.setMode(mode);
			onClose();
		}
	});

	return (
		<Box flexDirection="column" paddingX={1} width="100%">
			<Box marginBottom={1}>
				<Text bold color="white">[ Execution Mode ]</Text>
			</Box>

			{MODES.map((mode, i) => (
				<Box key={mode.key} flexDirection="column" marginBottom={0}>
					<Box>
						<Text color={i === selected ? 'white' : 'gray'}>
							{i === selected ? '> ' : '  '}
						</Text>
						<Text bold={i === selected} color={mode.color}>
							{mode.label}
						</Text>
						{context.getMode() === mode.key && (
							<Text color="green"> (active)</Text>
						)}
					</Box>
					{i === selected && (
						<Box marginLeft={4}>
							<Text dimColor>{mode.desc}</Text>
						</Box>
					)}
				</Box>
			))}

			<Box marginTop={1}>
				<Text dimColor>Enter to select * Esc to close</Text>
			</Box>
		</Box>
	);
};
