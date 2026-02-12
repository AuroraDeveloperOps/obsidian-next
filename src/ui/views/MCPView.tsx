import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { mcp } from '../../core/mcp.js';
import { listRegistry } from '../../core/mcp-registry.js';

interface MCPViewProps {
	onExit: () => void;
}

type ViewMode =
	| 'list'
	| 'add_name'
	| 'add_command'
	| 'add_args'
	| 'certified'
	| 'edit_env';

export const MCPView: React.FC<MCPViewProps> = ({ onExit }) => {
	const [servers, setServers] = useState(mcp.getStatus());
	const [registry] = useState(listRegistry());
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [certifiedIndex, setCertifiedIndex] = useState(0);
	const [mode, setMode] = useState<ViewMode>('list');
	const [error, setError] = useState<string | null>(null);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);

	// Form state
	const [newName, setNewName] = useState('');
	const [newCommand, setNewCommand] = useState('');
	const [newArgs, setNewArgs] = useState('');

	// Editing / Setup state
	const [editingServer, setEditingServer] = useState<string | null>(null);
	const [envKeysToPrompt, setEnvKeysToPrompt] = useState<string[]>([]);
	const [currentKeyIndex, setCurrentKeyIndex] = useState(0);
	const [currentValue, setCurrentValue] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		refreshList();
	}, []);

	const refreshList = () => {
		const list = mcp.getStatus();
		setServers(list);
		if (list.length === 0) setSelectedIndex(0);
		else if (selectedIndex >= list.length) setSelectedIndex(list.length - 1);
	};

	const startEnvSetup = (serverName: string, keys: string[]) => {
		setEditingServer(serverName);
		setEnvKeysToPrompt(keys);
		setCurrentKeyIndex(0);
		setCurrentValue('');
		setMode('edit_env');
		setError(null);
	};

	useInput(async (input, key) => {
		if (mode === 'list') {
			if (key.escape) {
				onExit();
				return;
			}

			if (key.upArrow) {
				setSelectedIndex((prev) =>
					prev > 0 ? prev - 1 : Math.max(0, servers.length - 1)
				);
			}
			if (key.downArrow) {
				setSelectedIndex((prev) => (prev < servers.length - 1 ? prev + 1 : 0));
			}

			if (input === 'i') {
				setMode('certified');
				setCertifiedIndex(0);
				setError(null);
				setStatusMessage(null);
			}

			if (input === 'a') {
				setMode('add_name');
				setNewName('');
				setNewCommand('');
				setNewArgs('');
				setError(null);
			}

			if (servers.length > 0) {
				const selected = servers[selectedIndex];

				if (input === 'e') {
					// Start editing keys for selected server
					// If in registry, use those keys. Otherwise maybe allow adding one?
					// For now, let's allow editing existing keys or common keys if empty.
					const regDef = listRegistry().find((r) => r.name === selected.name);
					const keysToPrompt = regDef?.env
						? Object.keys(regDef.env)
						: selected.config.env
							? Object.keys(selected.config.env)
							: [];

					if (keysToPrompt.length > 0) {
						startEnvSetup(selected.name, keysToPrompt);
					} else {
						setError(
							`Server '${selected.name}' has no configurable environment variables.`
						);
					}
				}

				if (input === 'r' || key.delete) {
					try {
						await mcp.removeServer(selected.name);
						setStatusMessage(`Removed server '${selected.name}'`);
						refreshList();
					} catch (e: any) {
						setError(e.message);
					}
				}

				if (input === 'c') {
					if (selected.connected) return;
					try {
						setStatusMessage(`Connecting to '${selected.name}'...`);
						await mcp.connect(selected.name, selected.config);
						setStatusMessage(`Connected to '${selected.name}'`);
						refreshList();
					} catch (e: any) {
						setError(e.message);
						setStatusMessage(null);
					}
				}

				if (input === 'd') {
					if (!selected.connected) return;
					try {
						setStatusMessage(`Disconnecting from '${selected.name}'...`);
						await mcp.disconnect(selected.name);
						setStatusMessage(`Disconnected '${selected.name}'`);
						refreshList();
					} catch (e: any) {
						setError(e.message);
						setStatusMessage(null);
						refreshList();
					}
				}
			}
		} else if (mode === 'certified') {
			if (key.escape) {
				setMode('list');
				return;
			}
			if (key.upArrow) {
				setCertifiedIndex((prev) =>
					prev > 0 ? prev - 1 : registry.length - 1
				);
			}
			if (key.downArrow) {
				setCertifiedIndex((prev) =>
					prev < registry.length - 1 ? prev + 1 : 0
				);
			}
			if (key.return) {
				const selected = registry[certifiedIndex];
				try {
					setStatusMessage(`Installing '${selected.name}'...`);
					// Skip immediate connection if it requires API keys, and jump to setup
					const skipConnect = !!selected.requiresApiKey;

					await mcp.addServer(
						selected.name,
						{
							command: selected.command,
							args: selected.args,
							env: selected.env,
							autoConnect: false // Initially false, connection logic will update it
						},
						skipConnect
					);

					if (skipConnect && selected.env) {
						startEnvSetup(selected.name, Object.keys(selected.env));
					} else {
						setStatusMessage(`Installed '${selected.name}' successfully!`);
						setMode('list');
						refreshList();
					}
				} catch (e: any) {
					setError(e.message);
					setStatusMessage(null);
				}
			}
		} else if (mode === 'edit_env') {
			if (key.escape) {
				setMode('list');
				return;
			}
		}
	});

	const handleNameSubmit = () => {
		if (!newName.trim()) {
			setMode('list');
			return;
		}
		setMode('add_command');
	};

	const handleCommandSubmit = () => {
		if (!newCommand.trim()) {
			setError('Command is required');
			return;
		}
		setMode('add_args');
	};

	const handleArgsSubmit = async () => {
		setMode('list');
		const argsArray = newArgs.split(' ').filter((a) => a.trim().length > 0);

		try {
			await mcp.addServer(newName, {
				command: newCommand,
				args: argsArray,
				autoConnect: false
			});
			setStatusMessage(`Added server '${newName}'`);
			refreshList();
		} catch (e: any) {
			setError(e.message);
		}
	};

	const handleEnvSubmit = async () => {
		if (!editingServer || isSubmitting) return;
		const key = envKeysToPrompt[currentKeyIndex];

		setIsSubmitting(true);
		setStatusMessage(`Saving secure configuration for ${editingServer}...`);

		try {
			// Save to KeyManager with 'obsidian-mcp' service and variable name as account
			const { keyManager } = await import('../../core/keyManager.js');
			await keyManager.storeKey(currentValue.trim(), {
				service: 'obsidian-mcp',
				account: key
			});

			// Update mcp.json to mark this env var as secure (managed by KeyManager)
			// We get the current config first
			// Note: mcp.updateServer needs to support merging secureEnv

			// For now, we manually manage the secureEnv Update
			// This requires we fetch the current server config...
			// Or we assume the server exists.

			// We need to fetch the existing securely-managed list or init it.
			// Let's rely on mcp.updateServer to handle this logic if we pass a special flag or structure,
			// OR we just assume `mcp.updateServer` merges fields.
			// Let's update `secureEnv` array.

			const currentStatus = mcp
				.getStatus()
				.find((s) => s.name === editingServer);
			const currentSecureEnv = currentStatus?.config.secureEnv || [];
			const newSecureEnv = Array.from(new Set([...currentSecureEnv, key])); // Unique add

			await mcp.updateServer(editingServer, {
				secureEnv: newSecureEnv
			});

			if (currentKeyIndex < envKeysToPrompt.length - 1) {
				setCurrentKeyIndex((prev) => prev + 1);
				setCurrentValue('');
				setStatusMessage(null);
			} else {
				setStatusMessage(
					`Configuration for '${editingServer}' securely updated!`
				);
				setMode('list');
				refreshList();
			}
		} catch (e: any) {
			setError(e.message);
		} finally {
			setIsSubmitting(false);
		}
	};

	// Scrolling logic
	const VISIBLE_ITEMS = 6;
	const startIdx = Math.max(
		0,
		Math.min(
			selectedIndex - Math.floor(VISIBLE_ITEMS / 2),
			servers.length - VISIBLE_ITEMS
		)
	);
	const endIdx = Math.min(startIdx + VISIBLE_ITEMS, servers.length);
	const visibleServers = servers.slice(startIdx, endIdx);

	return (
		<Box
			flexDirection="column"
			paddingX={1}
			borderStyle="round"
			borderColor="gray"
		>
			<Box
				marginBottom={1}
				borderStyle="single"
				borderTop={false}
				borderLeft={false}
				borderRight={false}
				borderBottom={true}
				borderColor="gray"
			>
				<Text bold color="red">
					MODEL CONTEXT PROTOCOL MANAGER
				</Text>
			</Box>

			{error && (
				<Box marginBottom={1}>
					<Text color="red">Error: {error}</Text>
				</Box>
			)}
			{statusMessage && (
				<Box marginBottom={1}>
					<Text color="green">{statusMessage}</Text>
				</Box>
			)}

			{mode === 'list' ? (
				<Box flexDirection="column">
					<Box flexDirection="row" marginBottom={1}>
						<Box width={30}>
							<Text color="gray" bold>
								Server Name
							</Text>
						</Box>
						<Box width={15}>
							<Text color="gray" bold>
								Status
							</Text>
						</Box>
						<Box flexGrow={1}>
							<Text color="gray" bold>
								Command / Args
							</Text>
						</Box>
					</Box>

					{servers.length === 0 ? (
						<Box paddingY={2} justifyContent="center">
							<Text color="gray">
								No servers configured. Press 'i' to install certified tools or
								'a' to add a custom one.
							</Text>
						</Box>
					) : (
						visibleServers.map((s, idx) => {
							const realIndex = startIdx + idx;
							const isSelected = realIndex === selectedIndex;
							return (
								<Box key={s.name} flexDirection="row">
									<Box width={30}>
										<Text
											color={isSelected ? 'red' : 'white'}
											bold={isSelected}
										>
											{isSelected ? '> ' : '  '}
											{s.name}
										</Text>
									</Box>
									<Box width={15}>
										<Text color={s.connected ? 'green' : 'red'}>
											{s.connected ? '● connected' : '○ offline'}
										</Text>
									</Box>
									<Box flexGrow={1}>
										<Text color="gray" wrap="truncate-end">
											{s.config.command} {s.config.args.join(' ')}
										</Text>
									</Box>
								</Box>
							);
						})
					)}
				</Box>
			) : mode === 'certified' ? (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text color="yellow">CERTIFIED SERVER STORE</Text>
					</Box>
					<Box flexDirection="row" marginBottom={1}>
						<Box width={20}>
							<Text color="gray" bold>
								Tool
							</Text>
						</Box>
						<Box flexGrow={1}>
							<Text color="gray" bold>
								Description
							</Text>
						</Box>
					</Box>
					{registry.map((r, i) => {
						const isInstalled = servers.some((s) => s.name === r.name);
						return (
							<Box key={r.name} flexDirection="row">
								<Box width={20}>
									<Text
										color={
											i === certifiedIndex
												? 'yellow'
												: isInstalled
													? 'green'
													: 'white'
										}
										bold={i === certifiedIndex}
									>
										{i === certifiedIndex ? '> ' : '  '}
										{r.name}
									</Text>
								</Box>
								<Box flexGrow={1}>
									<Text color={isInstalled ? 'gray' : 'white'}>
										{isInstalled ? '[Already Installed] ' : ''}
										{r.description}
									</Text>
								</Box>
							</Box>
						);
					})}
					{registry[certifiedIndex]?.requiresApiKey && (
						<Box marginTop={1}>
							<Text color="red">
								⚠️ Requires API Key/Token config in .obsidian/mcp.json
							</Text>
						</Box>
					)}
				</Box>
			) : (
				<Box flexDirection="column" paddingY={1}>
					{mode === 'add_name' && (
						<Box>
							<Text>Server Name: </Text>
							<TextInput
								value={newName}
								onChange={setNewName}
								onSubmit={handleNameSubmit}
							/>
						</Box>
					)}

					{mode === 'add_command' && (
						<Box>
							<Text>Command (e.g. npx): </Text>
							<TextInput
								value={newCommand}
								onChange={setNewCommand}
								onSubmit={handleCommandSubmit}
							/>
						</Box>
					)}

					{mode === 'add_args' && (
						<Box>
							<Text>Args (space separated): </Text>
							<TextInput
								value={newArgs}
								onChange={setNewArgs}
								onSubmit={handleArgsSubmit}
							/>
						</Box>
					)}

					{mode === 'edit_env' && (
						<Box flexDirection="column">
							<Box marginBottom={1}>
								<Text color="yellow">SETUP: {editingServer}</Text>
							</Box>
							<Box>
								<Text bold>{envKeysToPrompt[currentKeyIndex]}: </Text>
								<TextInput
									value={currentValue}
									onChange={setCurrentValue}
									onSubmit={handleEnvSubmit}
									mask="*"
								/>
								{isSubmitting && <Text color="yellow"> Saving...</Text>}
							</Box>
						</Box>
					)}
				</Box>
			)}

			<Box
				marginTop={1}
				borderStyle="single"
				borderTop={true}
				borderLeft={false}
				borderRight={false}
				borderBottom={false}
				borderColor="gray"
			>
				<Text color="gray">
					{mode === 'list' ? (
						<Text>
							<Text bold color="white">
								I
							</Text>{' '}
							Store ·{' '}
							<Text bold color="white">
								A
							</Text>{' '}
							Add ·{' '}
							<Text bold color="white">
								E
							</Text>{' '}
							Edit ·{' '}
							<Text bold color="red">
								R
							</Text>{' '}
							Remove ·{' '}
							<Text bold color="green">
								C
							</Text>{' '}
							Connect ·{' '}
							<Text bold color="yellow">
								D
							</Text>{' '}
							Disconnect · <Text bold>Esc</Text> Back
						</Text>
					) : mode === 'certified' ? (
						<Text>
							<Text bold color="white">
								Enter
							</Text>{' '}
							to install · <Text bold>Esc</Text> Cancel
						</Text>
					) : mode === 'edit_env' ? (
						<Text>
							<Text bold color="white">
								Enter
							</Text>{' '}
							to Set · <Text bold>Esc</Text> Cancel
						</Text>
					) : (
						'Press Enter to submit'
					)}
				</Text>
			</Box>
		</Box>
	);
};
