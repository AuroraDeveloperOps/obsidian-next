import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { config } from '../../core/config.js';
import { bus } from '../../core/bus.js';

interface SandboxViewProps {
	onClose: () => void;
}

export const SandboxView: React.FC<SandboxViewProps> = ({ onClose }) => {
	const [sandboxConfig, setSandboxConfig] = useState<any>(null);
	const [executionMode, setExecutionMode] = useState<string>('local');
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		const cfg = await config.load();
		setSandboxConfig(cfg.sandbox);
		setExecutionMode(cfg.executionMode || 'local');
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const toggleMode = async () => {
		setSaving(true);
		const cfg = await config.load();
		const newMode = executionMode === 'sandbox' ? 'local' : 'sandbox';
		await config.save({ ...cfg, executionMode: newMode } as any);
		setExecutionMode(newMode);
		setSaving(false);
		bus.emitAgent({ type: 'done', summary: `Execution mode set to ${newMode.toUpperCase()}` });
	};

	useInput(async (input, key) => {
		if (key.escape) {
			onClose();
			return;
		}
		
		if (input === 't' || input === 'T' || key.return) {
			await toggleMode();
		}
	});

	if (!sandboxConfig) {
		return (
			<Box padding={1}>
				<Text dimColor>Loading sandbox configuration...</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" paddingX={1} width="100%">
			<Box marginBottom={1}>
				<Text bold color="white">[ Sandbox Configuration ]</Text>
				<Text dimColor>  Status: </Text>
				<Text color={executionMode === 'sandbox' ? 'green' : 'yellow'} bold>
					{executionMode === 'sandbox' ? 'SANDBOX' : 'NO SANDBOX'}
				</Text>
				{saving && <Text color="gray"> (Saving...)</Text>}
			</Box>

			<Box marginBottom={1}>
				<Text color="cyan" bold>[T] Toggle Mode</Text>
				<Text dimColor> - Switch between Local and Sandbox</Text>
			</Box>

			<Text bold color="gray">Network Policy</Text>
			<Box flexDirection="column" marginBottom={1}>
				<Text>   Allowed Domains:</Text>
				{sandboxConfig.allowedDomains.map((d: string) => (
					<Text key={d} color="green">     + {d}</Text>
				))}
				{sandboxConfig.deniedDomains.length > 0 && (
					<>
						<Text>   Denied Domains:</Text>
						{sandboxConfig.deniedDomains.map((d: string) => (
							<Text key={d} color="red">     - {d}</Text>
						))}
					</>
				)}
			</Box>

			<Text bold color="gray">Filesystem Policy</Text>
			<Box flexDirection="column" marginBottom={1}>
				<Text>   Blocked Read Paths (Global):</Text>
				{sandboxConfig.denyRead.slice(0, 5).map((p: string) => (
					<Text key={p} color="red">     - {p}</Text>
				))}
				<Text>   Allowed Write Paths:</Text>
				{sandboxConfig.allowWrite.map((p: string) => (
					<Text key={p} color="green">     + {p}</Text>
				))}
				<Text>   Protected Write Paths:</Text>
				{sandboxConfig.denyWrite.slice(0, 5).map((p: string) => (
					<Text key={p} color="red">     - {p}</Text>
				))}
			</Box>

			<Box marginTop={1}>
				<Text dimColor>To modify these settings, edit .obsidian-next/config.json</Text>
				<Text dimColor>Esc to close</Text>
			</Box>
		</Box>
	);
};
