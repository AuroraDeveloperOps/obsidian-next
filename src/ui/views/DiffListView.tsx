import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { diffManager, DiffEntry } from '../../core/diff.js';
import path from 'path';

interface DiffListViewProps {
	onClose: () => void;
}

export const DiffListView: React.FC<DiffListViewProps> = ({ onClose }) => {
	const [diffs, setDiffs] = useState<DiffEntry[]>([]);
	const [selected, setSelected] = useState(0);
	const [expanded, setExpanded] = useState(false);

	useEffect(() => {
		diffManager.listDiffs(20).then(setDiffs);
	}, []);

	useInput((input, key) => {
		if (key.escape) {
			if (expanded) {
				setExpanded(false);
				return;
			}
			onClose();
			return;
		}
		if (key.upArrow) setSelected((p) => Math.max(0, p - 1));
		if (key.downArrow) setSelected((p) => Math.min(diffs.length - 1, p + 1));
		if (key.return && diffs.length > 0) setExpanded(!expanded);
		if ((input === 'c' || input === 'C') && diffs.length > 0) {
			diffManager.clearAll().then(() => {
				setDiffs([]);
			});
		}
	});

	if (diffs.length === 0) {
		return (
			<Box flexDirection="column" paddingX={1}>
				<Box marginBottom={1}>
					<Text bold color="white">[ File Diffs ]</Text>
				</Box>
				<Text dimColor>No diffs stored. Diffs are saved when files are modified.</Text>
				<Box marginTop={1}>
					<Text dimColor>Esc to close</Text>
				</Box>
			</Box>
		);
	}

	const currentDiff = diffs[selected];

	return (
		<Box flexDirection="column" paddingX={1} width="100%">
			<Box marginBottom={1}>
				<Text bold color="white">[ File Diffs ]</Text>
				<Text dimColor>  {diffs.length} changes</Text>
			</Box>

			{!expanded ? (
				<>
					{diffs.map((diff, i) => {
						const date = new Date(diff.timestamp);
						const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
						return (
							<Box key={i}>
								<Text color={i === selected ? 'white' : 'gray'}>
									{i === selected ? '> ' : '  '}
								</Text>
								<Text bold={i === selected}>
									{path.basename(diff.filePath).padEnd(20)}
								</Text>
								<Text color="green">+{diff.additions}</Text>
								<Text dimColor>/</Text>
								<Text color="red">-{diff.deletions}</Text>
								<Text dimColor>  {time}</Text>
							</Box>
						);
					})}
				</>
			) : (
				<Box flexDirection="column">
					<Text bold>{path.basename(currentDiff.filePath)}</Text>
					<Text dimColor>{currentDiff.filePath}</Text>
					<Text dimColor>Lines: {currentDiff.beforeLines} {'>'} {currentDiff.afterLines}</Text>
					<Text> </Text>
					{currentDiff.diff.split('\n').slice(0, 30).map((line, i) => {
						let color: string | undefined;
						if (line.startsWith('+')) color = 'green';
						else if (line.startsWith('-')) color = 'red';
						else if (line.startsWith('@@')) color = 'cyan';
						return (
							<Text key={i} color={color as any} dimColor={!color}>
								{line}
							</Text>
						);
					})}
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>Enter expand * c clear all * Esc {expanded ? 'back' : 'close'}</Text>
			</Box>
		</Box>
	);
};
