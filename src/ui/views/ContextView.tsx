import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { context } from '../../core/context.js';
import { highlightJson } from '../../utils/highlight.js';

interface ContextViewProps {
	onClose: () => void;
}

export const ContextView = ({ onClose }: ContextViewProps) => {
	const [contextSummary, setContextSummary] = useState('Loading...');

	useEffect(() => {
		const fullContext = context.get();
		const summary = highlightJson(JSON.stringify(fullContext, null, 2));
		setContextSummary(summary);
	}, []);

	return (
		<Box flexDirection="column" padding={1} borderStyle="round">
			<Box marginBottom={1}>
				<Text bold>Active Session Context</Text>
			</Box>
			<Box>
				<Text>{contextSummary}</Text>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>(Press Esc to close)</Text>
			</Box>
		</Box>
	);
};
