import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { config } from '../../core/config.js';
import { tools } from '../../tools/index.js';
import { sandbox } from '../../core/sandbox.js';
import { keyManager } from '../../core/keyManager.js';
import Anthropic from '@anthropic-ai/sdk';
import { useInput } from 'ink';

interface CheckResult {
	name: string;
	status: 'ok' | 'warn' | 'error';
	message: string;
}

interface DoctorViewProps {
	onClose: () => void;
}

export const DoctorView: React.FC<DoctorViewProps> = ({ onClose }) => {
	const [results, setResults] = useState<CheckResult[]>([]);
	const [loading, setLoading] = useState(true);

	const runDiagnostics = async () => {
		setLoading(true);
		const checks: CheckResult[] = [];

		// 1. Check configuration
		try {
			const cfg = await config.load();
			const apiKey = await keyManager.loadKey();
			const backend = keyManager.getBackend();

			if (apiKey) {
				checks.push({
					name: 'API Key',
					status: 'ok',
					message: `Configured (${backend})`
				});
			} else {
				checks.push({
					name: 'API Key',
					status: 'error',
					message: 'Not set. Run /init'
				});
			}

			checks.push({
				name: 'Model',
				status: 'ok',
				message: cfg.model
			});
		} catch (e) {
			checks.push({
				name: 'Config',
				status: 'error',
				message: 'Failed to load config'
			});
		}

		// 2. Check tools
		const toolList = await tools.list();
		checks.push({
			name: 'Tools',
			status: 'ok',
			message: `${toolList.length} registered`
		});

		// 3. Check sandbox
		const sandboxAvailable = await sandbox.isAvailable();
		checks.push({
			name: 'Sandbox',
			status: sandboxAvailable ? 'ok' : 'warn',
			message: sandboxAvailable ? 'Available' : 'Not available'
		});

		// 4. Check API connectivity (lightweight)
		try {
			const apiKey = await keyManager.loadKey();
			if (apiKey) {
				// Just instantiate, don't ping to save cost/time
				new Anthropic({ apiKey });
				checks.push({
					name: 'API Client',
					status: 'ok',
					message: 'Initialized'
				});
			}
		} catch (e: any) {
			checks.push({
				name: 'API Client',
				status: 'error',
				message: e.message || 'Error'
			});
		}

		// 5. Check Node
		const nodeVer = process.version;
		const major = parseInt(nodeVer.slice(1).split('.')[0]);
		checks.push({
			name: 'Node.js',
			status: major >= 18 ? 'ok' : 'warn',
			message: nodeVer
		});

		setResults(checks);
		setLoading(false);
	};

	useEffect(() => {
		runDiagnostics();
	}, []);

	useInput((input, key) => {
		if (key.escape) {
			onClose();
		}
		if (input === 'r' || input === 'R') {
			runDiagnostics();
		}
	});

	return (
		<Box
			flexDirection="column"
			width="100%"
			height="100%"
			paddingX={1}
			paddingY={0}
		>
			{/* Minimal Header */}
			<Box marginBottom={1}>
				<Text bold color="white">
					[ System Diagnostics ]
				</Text>
			</Box>

			{loading ? (
				<Text color="gray">Running checks...</Text>
			) : (
				<Box flexDirection="column">
					{results.map((check, i) => (
						<Box key={i} flexDirection="row" marginBottom={0}>
							<Box width={14}>
								<Text color="gray">{check.name}</Text>
							</Box>
							<Box>
								<Text
									color={
										check.status === 'ok'
											? 'green'
											: check.status === 'warn'
												? 'yellow'
												: 'red'
									}
								>
									{check.status === 'ok' ? 'OK' : check.status.toUpperCase()}
								</Text>
								<Text color="gray"> · {check.message}</Text>
							</Box>
						</Box>
					))}
				</Box>
			)}

			{/* Minimal Footer */}
			<Box marginTop={1}>
				<Text color="gray" dimColor>
					Esc to close
				</Text>
			</Box>
		</Box>
	);
};
