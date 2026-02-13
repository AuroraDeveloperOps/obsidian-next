import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { tools } from '../../tools/index.js';

interface ToolListViewProps {
	onClose: () => void;
}

interface ToolInfo {
	name: string;
	description: string;
}

export const ToolListView: React.FC<ToolListViewProps> = ({ onClose }) => {
	const [toolList, setToolList] = useState<ToolInfo[]>([]);
	const [selected, setSelected] = useState(0);

	useEffect(() => {
		tools.list().then((list) => setToolList(list));
	}, []);

	useInput((_, key) => {
		if (key.escape) onClose();
		if (key.upArrow) setSelected((p) => Math.max(0, p - 1));
		if (key.downArrow) setSelected((p) => Math.min(toolList.length - 1, p + 1));
	});

	return (
		<Box flexDirection="column" paddingX={1} width="100%">
			<Box marginBottom={1}>
				<Text bold color="white">[ Tool Registry ]</Text>
				<Text dimColor>  {toolList.length} tools</Text>
			</Box>

			{toolList.map((tool, i) => (
				<Box key={tool.name} flexDirection="column">
					<Box>
						<Text color={i === selected ? 'white' : 'gray'}>
							{i === selected ? '> ' : '  '}
						</Text>
						<Text bold={i === selected} color="cyan">
							{tool.name.padEnd(14)}
						</Text>
						<Text dimColor>{tool.description}</Text>
					</Box>
				</Box>
			))}

			<Box marginTop={1}>
				<Text dimColor>Manual: /tool {'<name> <json-args>'} * Esc to close</Text>
			</Box>
		</Box>
	);
};
