import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { llm } from '../../core/llm/index.js';
import { checkDependencies, isComputerUseAvailable } from '../../computer/index.js';

interface PilotViewProps {
	onClose: () => void;
}

export const PilotView: React.FC<PilotViewProps> = ({ onClose }) => {
	const [isEnabled, setIsEnabled] = useState(false);
	const [available, setAvailable] = useState(false);
	const [deps, setDeps] = useState<{ available: boolean; missing: string[] } | null>(null);
	const [selected, setSelected] = useState(0);

	useEffect(() => {
		const load = async () => {
			setIsEnabled(llm.isComputerUseEnabled());
			setAvailable(isComputerUseAvailable());
			const d = await checkDependencies();
			setDeps(d);
		};
		load();
	}, []);

	const items = [
		{ key: 'toggle', label: isEnabled ? 'Disable Computer Use' : 'Enable Computer Use' },
	];

	useInput(async (_, key) => {
		if (key.escape) {
			onClose();
			return;
		}
		if (key.upArrow) setSelected((p) => Math.max(0, p - 1));
		if (key.downArrow) setSelected((p) => Math.min(items.length - 1, p + 1));
		if (key.return) {
			if (items[selected].key === 'toggle') {
				if (isEnabled) {
					llm.disableComputerUse();
					setIsEnabled(false);
				} else {
					await llm.enableComputerUse();
					setIsEnabled(true);
				}
			}
		}
	});

	return (
		<Box flexDirection="column" paddingX={1} width="100%">
			<Box marginBottom={1}>
				<Text bold color="white">[ Computer Use (Pilot) ]</Text>
			</Box>

			<Text>Status: <Text color={isEnabled ? 'green' : 'red'} bold>{isEnabled ? 'ENABLED' : 'DISABLED'}</Text></Text>
			<Text>Platform: <Text dimColor>{available ? 'Supported (macOS)' : 'Not supported'}</Text></Text>
			<Text> </Text>

			{deps && (
				<>
					<Text bold color="gray">Dependencies</Text>
					{deps.available ? (
						<Text color="green">   All dependencies installed</Text>
					) : (
						deps.missing.map((m, i) => (
							<Text key={i} color="red">   [MISSING] {m}</Text>
						))
					)}
					<Text> </Text>
				</>
			)}

			<Text bold color="gray">Features</Text>
			<Text dimColor>   Beta API with schema-less Anthropic tools</Text>
			<Text dimColor>   Automatic coordinate scaling for high-res displays</Text>
			<Text dimColor>   Screenshot capture, mouse/keyboard control</Text>
			<Text> </Text>

			{items.map((item, i) => (
				<Box key={item.key}>
					<Text color={i === selected ? 'white' : 'gray'}>
						{i === selected ? '> ' : '  '}
					</Text>
					<Text bold={i === selected}>{item.label}</Text>
				</Box>
			))}

			<Box marginTop={1}>
				<Text dimColor>Enter to toggle * Esc to close</Text>
			</Box>
		</Box>
	);
};
