import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { bus } from '../core/bus.js';

interface ApprovalPromptProps {
	requestId: string;
	context: string;
	diff?: string;
	onResolve: () => void;
}

/**
 * ApprovalPrompt - Compact permission dialog for sensitive operations
 *
 * (y/Enter) Allow Once | (a) Allow Always | (n/Esc) Deny | (d) Deny Always
 * (s) No Sandbox | (b) Always + No Sandbox
 */
export const ApprovalPrompt: React.FC<ApprovalPromptProps> = ({
	requestId,
	context,
	diff,
	onResolve
}) => {
	const [resolved, setResolved] = useState(false);

	const handleApproval = useCallback(
		(
			approved: boolean,
			scope: 'session' | 'persistent',
			bypass: boolean = false
		) => {
			if (resolved) return;
			setResolved(true);

			bus.emitUser({
				type: 'approval_response',
				approved,
				requestId,
				scope,
				bypass
			});

			onResolve();
		},
		[resolved, requestId, onResolve]
	);

	useInput((input, key) => {
		if (resolved) return;

		const lowerInput = input.toLowerCase();

		if (lowerInput === 'y' || (key.return && !key.shift)) {
			handleApproval(true, 'session');
		}
		if (lowerInput === 'a') {
			handleApproval(true, 'persistent');
		}
		if (lowerInput === 's') {
			handleApproval(true, 'session', true);
		}
		if (lowerInput === 'b') {
			handleApproval(true, 'persistent', true);
		}
		if (lowerInput === 'n' || key.escape) {
			handleApproval(false, 'session');
		}
		if (lowerInput === 'd') {
			handleApproval(false, 'persistent');
		}
	});

	if (resolved) return null;

	// Parse context
	const lines = context.split('\n');
	const commandLine = lines.find((l) => l.startsWith('Command:'));
	const reasonLine = lines.find((l) => l.startsWith('Reason:'));
	const command = commandLine ? commandLine.replace('Command:', '').trim() : context;
	const reason = reasonLine ? reasonLine.replace('Reason:', '').trim() : null;

	return (
		<Box flexDirection="column" paddingX={0}>
			{/* Header + Command on one line */}
			<Box>
				<Text color="yellow" bold>[PERMISSION] </Text>
				<Text color="cyan" bold>{command}</Text>
			</Box>

			{/* Reason */}
			{reason && (
				<Box marginLeft={2}>
					<Text dimColor>{reason}</Text>
				</Box>
			)}

			{/* Diff Preview */}
			{diff && (
				<Box flexDirection="column" marginLeft={2}>
					{diff
						.split('\n')
						.slice(0, 8)
						.map((line, i) => (
							<Text
								key={i}
								color={
									line.startsWith('+')
										? 'green'
										: line.startsWith('-')
											? 'red'
											: 'gray'
								}
							>
								{line}
							</Text>
						))}
					{diff.split('\n').length > 8 && (
						<Text dimColor>... ({diff.split('\n').length - 8} more lines)</Text>
					)}
				</Box>
			)}

			{/* Compact action bar */}
			<Box marginTop={0}>
				<Text color="green" bold>(y)</Text>
				<Text dimColor> allow </Text>
				<Text color="green" bold>(a)</Text>
				<Text dimColor> always </Text>
				<Text color="red" bold>(n)</Text>
				<Text dimColor> deny </Text>
				<Text color="red" bold>(d)</Text>
				<Text dimColor> deny always </Text>
				<Text color="yellow" bold>(s)</Text>
				<Text dimColor> no sandbox </Text>
				<Text color="yellow" bold>(b)</Text>
				<Text dimColor> always+no sandbox</Text>
			</Box>
		</Box>
	);
};
