import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

interface ThinkingIndicatorProps {
	activity: string | null;
	startTime: number;
	tokensIn: number;
}

function formatElapsed(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	return `${minutes}m ${remainder}s`;
}

function formatTokens(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
	return n.toString();
}

const ThinkingIndicatorComponent: React.FC<ThinkingIndicatorProps> = ({
	activity,
	startTime,
	tokensIn,
}) => {
	const [elapsed, setElapsed] = useState(Date.now() - startTime);

	useEffect(() => {
		const interval = setInterval(() => {
			setElapsed(Date.now() - startTime);
		}, 1000);
		return () => clearInterval(interval);
	}, [startTime]);

	const label = activity || 'Thinking';

	return (
		<Box marginLeft={2}>
			<Text>
				<Text color="white" dimColor>{'\u273B'} </Text>
				<Text dimColor>{label}... </Text>
				<Text dimColor>({formatElapsed(elapsed)}</Text>
				<Text dimColor> {'\u00B7'} </Text>
				<Text dimColor>{formatTokens(tokensIn)} tokens)</Text>
			</Text>
		</Box>
	);
};

export const ThinkingIndicator = React.memo(ThinkingIndicatorComponent);
