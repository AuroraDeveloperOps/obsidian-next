import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { config } from '../../core/config.js';
import { usage } from '../../core/usage.js';
import { tools } from '../../tools/index.js';
import { context } from '../../core/context.js';
import { keyManager } from '../../core/keyManager.js';
import os from 'os';
import path from 'path';

interface StatusViewProps {
	onClose: () => void;
}

export const StatusView: React.FC<StatusViewProps> = ({ onClose }) => {
	const [data, setData] = useState<any>(null);

	useInput((_, key) => {
		if (key.escape) onClose();
	});

	useEffect(() => {
		const load = async () => {
			const cfg = await config.load();
			const stats = usage.getStats();
			const sessionCost = usage.getSessionCost();
			const toolList = await tools.list();
			const hasKey = await keyManager.hasKey();
			const ver = await config.getVersion();
			const tokens = usage.getSessionTokens();

			setData({
				platform: `${os.type()} ${os.release()}`,
				node: process.version,
				workspace: path.basename(process.cwd()),
				model: cfg.model,
				maxTokens: cfg.maxTokens,
				hasKey,
				sessionCost,
				inputTokens: stats.totalInputTokens,
				outputTokens: stats.totalOutputTokens,
				toolCount: toolList.length,
				version: ver.startsWith('v') ? ver : `v${ver}`,
				mode: context.getMode(),
				sessionInput: tokens.input,
				sessionOutput: tokens.output,
				cacheHit: usage.getCacheHitRate()
			});
		};
		load();
	}, []);

	if (!data) {
		return (
			<Box padding={1}>
				<Text dimColor>Loading status...</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" paddingX={1} width="100%">
			<Box marginBottom={1}>
				<Text bold color="white">[ System Status ]</Text>
			</Box>

			<Text bold color="gray">System</Text>
			<Text>   Platform     <Text dimColor>{data.platform}</Text></Text>
			<Text>   Runtime      <Text dimColor>Node.js {data.node}</Text></Text>
			<Text>   Workspace    <Text dimColor>{data.workspace}</Text></Text>
			<Text>   Version      <Text dimColor>{data.version}</Text></Text>
			<Text> </Text>

			<Text bold color="gray">Configuration</Text>
			<Text>   Model        <Text dimColor>{data.model}</Text></Text>
			<Text>   Max Tokens   <Text dimColor>{data.maxTokens}</Text></Text>
			<Text>   Mode         <Text dimColor>{data.mode}</Text></Text>
			<Text>   API Key      <Text color={data.hasKey ? 'green' : 'red'}>{data.hasKey ? 'Configured' : 'Missing'}</Text></Text>
			<Text> </Text>

			<Text bold color="gray">Session</Text>
			<Text>   Cost         <Text dimColor>${data.sessionCost.toFixed(4)}</Text></Text>
			<Text>   Input        <Text dimColor>{data.sessionInput.toLocaleString()} tokens</Text></Text>
			<Text>   Output       <Text dimColor>{data.sessionOutput.toLocaleString()} tokens</Text></Text>
			<Text>   Cache Hit    <Text dimColor>{data.cacheHit.hitRate.toFixed(1)}%</Text></Text>
			<Text> </Text>

			<Text bold color="gray">Capabilities</Text>
			<Text>   Tools        <Text dimColor>{data.toolCount} registered</Text></Text>

			<Box marginTop={1}>
				<Text dimColor>Esc to close</Text>
			</Box>
		</Box>
	);
};
