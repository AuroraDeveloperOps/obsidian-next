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
 * ApprovalPrompt - Clear permission dialog for sensitive operations
 *
 * Options:
 * - (y) Allow Once: Execute this command once, ask again next time
 * - (a) Allow Always: Remember this command, never ask again
 * - (n) Deny Once: Block this command, but allow future requests
 * - (d) Deny Always: Block this command and all future attempts
 * - (s) Allow + Skip Sandbox: Execute without security sandbox (session only)
 * - (b) Allow + Skip Sandbox (Always): Execute without sandbox, remember choice
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

		// Y/y or Enter = Allow this once
		if (lowerInput === 'y' || (key.return && !key.shift)) {
			handleApproval(true, 'session');
		}

		// A/a = Allow always (remember this permission)
		if (lowerInput === 'a') {
			handleApproval(true, 'persistent');
		}

		// S/s = Allow + skip sandbox (session only)
		if (lowerInput === 's') {
			handleApproval(true, 'session', true);
		}

		// B/b = Allow + skip sandbox (remember)
		if (lowerInput === 'b') {
			handleApproval(true, 'persistent', true);
		}

		// N/n or Escape = Deny this once
		if (lowerInput === 'n' || key.escape) {
			handleApproval(false, 'session');
		}

		// D/d = Deny always (block permanently)
		if (lowerInput === 'd') {
			handleApproval(false, 'persistent');
		}
	});

	if (resolved) {
		return null;
	}

	// Parse context to extract command and reason
	const lines = context.split('\n');
	const commandLine = lines.find((l) => l.startsWith('Command:'));
	const reasonLine = lines.find((l) => l.startsWith('Reason:'));
	const command = commandLine
		? commandLine.replace('Command:', '').trim()
		: context;
	const reason = reasonLine ? reasonLine.replace('Reason:', '').trim() : null;

	return (
		<Box flexDirection="column" paddingX={0} marginY={1}>
			{/* Header */}
			<Box marginBottom={1}>
				<Text color="yellow" bold>
					[PERMISSION REQUIRED]
				</Text>
			</Box>

			{/* Command Display */}
			<Box flexDirection="column" marginBottom={1}>
				<Text color="gray">Command: </Text>
				<Box marginLeft={2}>
					<Text color="cyan" bold>
						{command}
					</Text>
				</Box>
			</Box>

			{/* Reason (if available) */}
			{reason && (
				<Box marginBottom={1}>
					<Text color="gray">Reason: </Text>
					<Text color="white">{reason}</Text>
				</Box>
			)}

			{/* Diff Preview (if provided) */}
			{diff && (
				<Box flexDirection="column" paddingX={0} marginBottom={1}>
					<Text color="gray" dimColor>
						Changes:
					</Text>
					<Box flexDirection="column" marginLeft={2}>
						{diff
							.split('\n')
							.slice(0, 10)
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
						{diff.split('\n').length > 10 && (
							<Text color="gray" dimColor>
								... ({diff.split('\n').length - 10} more lines)
							</Text>
						)}
					</Box>
				</Box>
			)}

			{/* Clear Action Options */}
			<Box flexDirection="column" marginTop={1}>
				<Text color="gray" dimColor>
					Choose an action:
				</Text>
				<Box marginLeft={2} flexDirection="column">
					<Box>
						<Text color="green" bold>
							(y)
						</Text>
						<Text color="white"> Allow Once</Text>
						<Text color="gray" dimColor>
							{' '}
							- Run this command now
						</Text>
					</Box>
					<Box>
						<Text color="green" bold>
							(a)
						</Text>
						<Text color="white"> Allow Always</Text>
						<Text color="gray" dimColor>
							{' '}
							- Remember and auto-approve
						</Text>
					</Box>
					<Box>
						<Text color="red" bold>
							(n)
						</Text>
						<Text color="white"> Deny Once</Text>
						<Text color="gray" dimColor>
							{' '}
							- Block this time only
						</Text>
					</Box>
					<Box>
						<Text color="red" bold>
							(d)
						</Text>
						<Text color="white"> Deny Always</Text>
						<Text color="gray" dimColor>
							{' '}
							- Block permanently
						</Text>
					</Box>
				</Box>
				<Box marginLeft={2} marginTop={1}>
					<Text color="gray" dimColor>
						Advanced:{' '}
					</Text>
					<Text color="yellow" bold>
						(s)
					</Text>
					<Text color="gray" dimColor>
						{' '}
						Allow + No Sandbox{' '}
					</Text>
					<Text color="yellow" bold>
						(b)
					</Text>
					<Text color="gray" dimColor>
						{' '}
						Always + No Sandbox
					</Text>
				</Box>
			</Box>
		</Box>
	);
};
