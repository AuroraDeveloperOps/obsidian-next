import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import {
	getCuratedModels,
	getEndpoints,
	testEndpoint,
	listRemoteModels,
	pullModel,
	addEndpoint,
	removeEndpoint,
	OllamaModelEntry,
	OllamaEndpoint
} from '../../core/ollama-registry.js';
import { config } from '../../core/config.js';
import { bus } from '../../core/bus.js';

interface OllamaViewProps {
	onClose: () => void;
}

type Tab = 'browse' | 'installed' | 'endpoints';

export const OllamaView: React.FC<OllamaViewProps> = ({ onClose }) => {
	const [tab, setTab] = useState<Tab>('browse');
	const [selected, setSelected] = useState(0);

	// Browse tab
	const [curated, setCurated] = useState<OllamaModelEntry[]>([]);
	const [installedNames, setInstalledNames] = useState<string[]>([]);
	const [filter, setFilter] = useState<'all' | 'recommended' | 'tools' | 'vision'>('all');
	const [pulling, setPulling] = useState<string | null>(null);
	const [pullProgress, setPullProgress] = useState('');

	// Installed tab
	const [installed, setInstalled] = useState<any[]>([]);

	// Endpoints tab
	const [endpoints, setEndpoints] = useState<OllamaEndpoint[]>([]);
	const [addingEndpoint, setAddingEndpoint] = useState(false);
	const [newHost, setNewHost] = useState('');
	const [newPort, setNewPort] = useState('11434');
	const [testResult, setTestResult] = useState<string | null>(null);

	// Load data
	useEffect(() => {
		const load = async () => {
			setCurated(getCuratedModels());
			const eps = await getEndpoints();
			setEndpoints(eps);

			// Try to fetch installed models
			const defaultEp = eps.find((e) => e.isDefault) || eps[0];
			if (defaultEp) {
				const names = await listRemoteModels(defaultEp);
				setInstalledNames(names);

				// Build installed list with sizes
				try {
					const cfg = await config.load();
					const baseUrl = cfg.ollama?.baseUrl || `http://${defaultEp.host}:${defaultEp.port}`;
					const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
					if (res.ok) {
						const data = await res.json();
						setInstalled(data.models || []);
					}
				} catch {}
			}
		};
		load();
	}, []);

	// Filter curated models
	const filteredModels = curated.filter((m) => {
		if (filter === 'recommended') return m.recommended;
		if (filter === 'tools') return m.capabilities.tools;
		if (filter === 'vision') return m.capabilities.vision;
		return true;
	});

	useInput(async (input, key) => {
		if (key.escape) {
			if (addingEndpoint) {
				setAddingEndpoint(false);
				return;
			}
			onClose();
			return;
		}

		// Tab switching
		if (key.tab) {
			const tabs: Tab[] = ['browse', 'installed', 'endpoints'];
			const idx = tabs.indexOf(tab);
			setTab(tabs[(idx + 1) % tabs.length]);
			setSelected(0);
			return;
		}

		if (addingEndpoint) return;

		if (key.upArrow) setSelected((p) => Math.max(0, p - 1));
		if (key.downArrow) {
			const maxIdx = tab === 'browse' ? filteredModels.length - 1
				: tab === 'installed' ? installed.length - 1
				: endpoints.length - 1;
			setSelected((p) => Math.min(maxIdx, p + 1));
		}

		// Filter cycling in browse tab
		if (tab === 'browse' && (input === 'f' || input === 'F')) {
			const filters: typeof filter[] = ['all', 'recommended', 'tools', 'vision'];
			const idx = filters.indexOf(filter);
			setFilter(filters[(idx + 1) % filters.length]);
			setSelected(0);
		}

		// Pull model in browse tab
		if (tab === 'browse' && (input === 'p' || input === 'P') && filteredModels.length > 0) {
			const model = filteredModels[selected];
			if (pulling) return;

			setPulling(model.name);
			setPullProgress('Starting pull...');

			const ep = endpoints.find((e) => e.isDefault) || endpoints[0];
			if (ep) {
				const success = await pullModel(ep, model.name, (status, completed, total) => {
					if (completed && total) {
						const pct = Math.round((completed / total) * 100);
						setPullProgress(`${status}: ${pct}%`);
					} else {
						setPullProgress(status);
					}
				});

				if (success) {
					setPullProgress('');
					setPulling(null);
					setInstalledNames((prev) => [...prev, model.name]);
					bus.emitAgent({ type: 'done', summary: `Pulled ${model.displayName}` });
				} else {
					setPullProgress('Pull failed');
					setTimeout(() => { setPulling(null); setPullProgress(''); }, 2000);
				}
			}
		}

		// Select model in installed tab
		if (tab === 'installed' && key.return && installed.length > 0) {
			const model = installed[selected];
			const cfg = await config.load();
			const newConfig = { ...cfg } as any;
			newConfig.provider = 'ollama';
			newConfig.ollama = {
				...cfg.ollama,
				models: { ...(cfg.ollama?.models || {}), chat: model.name, tool: model.name }
			};
			await config.save(newConfig);
			bus.emitAgent({ type: 'done', summary: `Selected ${model.name}` });
			onClose();
		}

		// Add endpoint
		if (tab === 'endpoints' && (input === 'a' || input === 'A')) {
			setAddingEndpoint(true);
			setNewHost('');
			setNewPort('11434');
		}

		// Test endpoint
		if (tab === 'endpoints' && (input === 't' || input === 'T') && endpoints.length > 0) {
			const ep = endpoints[selected];
			setTestResult('Testing...');
			const result = await testEndpoint(ep);
			setTestResult(result.ok ? `OK - ${result.modelCount} models` : `Failed: ${result.error}`);
			setTimeout(() => setTestResult(null), 3000);
		}

		// Delete endpoint
		if (tab === 'endpoints' && (input === 'd' || input === 'D') && endpoints.length > 0) {
			const ep = endpoints[selected];
			if (!ep.isDefault) {
				await removeEndpoint(ep.id);
				setEndpoints((prev) => prev.filter((e) => e.id !== ep.id));
				setSelected(0);
			}
		}
	});

	const handleAddEndpoint = async () => {
		if (!newHost.trim()) return;
		const ep: OllamaEndpoint = {
			id: `ep_${Date.now()}`,
			name: newHost.trim(),
			host: newHost.trim(),
			port: parseInt(newPort) || 11434,
			isDefault: false
		};
		await addEndpoint(ep);
		setEndpoints((prev) => [...prev, ep]);
		setAddingEndpoint(false);
	};

	const tabStyle = (t: Tab) => ({
		color: tab === t ? 'white' as const : 'gray' as const,
		bold: tab === t
	});

	return (
		<Box flexDirection="column" paddingX={1} width="100%">
			{/* Header with tabs */}
			<Box marginBottom={1}>
				<Text bold color="white">[ Ollama ]  </Text>
				<Text {...tabStyle('browse')}>[Browse]</Text>
				<Text dimColor>  </Text>
				<Text {...tabStyle('installed')}>[Installed]</Text>
				<Text dimColor>  </Text>
				<Text {...tabStyle('endpoints')}>[Endpoints]</Text>
			</Box>

			{/* Browse Tab */}
			{tab === 'browse' && (
				<>
					<Box marginBottom={1}>
						<Text dimColor>Filter: </Text>
						<Text bold color={filter === 'all' ? 'white' : 'gray'}>{filter}</Text>
						<Text dimColor>  (f to cycle)</Text>
					</Box>

					{pulling && (
						<Box marginBottom={1}>
							<Text color="yellow">Pulling {pulling}: {pullProgress}</Text>
						</Box>
					)}

					{filteredModels.map((model, i) => {
						const isInstalled = installedNames.some((n) => n.includes(model.family));
						return (
							<Box key={model.name} flexDirection="column">
								<Box>
									<Text color={i === selected ? 'white' : 'gray'}>
										{i === selected ? '> ' : '  '}
									</Text>
									<Text bold={i === selected}>
										{model.displayName.padEnd(22)}
									</Text>
									<Text dimColor>{model.size.padEnd(8)}</Text>
									{model.capabilities.tools && <Text color="cyan">T</Text>}
									{model.capabilities.vision && <Text color="yellow">V</Text>}
									{model.capabilities.reasoning && <Text color="green">R</Text>}
									{isInstalled && <Text color="green"> [installed]</Text>}
									{model.recommended && <Text color="yellow"> *</Text>}
								</Box>
								{i === selected && (
									<Box marginLeft={4}>
										<Text dimColor>{model.description} (Min: {model.minRAM})</Text>
									</Box>
								)}
							</Box>
						);
					})}
				</>
			)}

			{/* Installed Tab */}
			{tab === 'installed' && (
				<>
					{installed.length === 0 ? (
						<Text dimColor>No local models. Switch to Browse tab and pull one.</Text>
					) : (
						installed.map((model: any, i: number) => (
							<Box key={model.name}>
								<Text color={i === selected ? 'white' : 'gray'}>
									{i === selected ? '> ' : '  '}
								</Text>
								<Text bold={i === selected}>
									{model.name.padEnd(30)}
								</Text>
								<Text dimColor>{(model.size / 1e9).toFixed(1)}GB</Text>
							</Box>
						))
					)}
				</>
			)}

			{/* Endpoints Tab */}
			{tab === 'endpoints' && (
				<>
					{addingEndpoint ? (
						<Box flexDirection="column">
							<Text bold>Add Endpoint</Text>
							<Box marginTop={1}>
								<Text>Host: </Text>
								<TextInput
									value={newHost}
									onChange={setNewHost}
									onSubmit={handleAddEndpoint}
									placeholder="192.168.1.100"
								/>
							</Box>
						</Box>
					) : (
						<>
							{testResult && (
								<Box marginBottom={1}>
									<Text color={testResult.startsWith('OK') ? 'green' : 'red'}>{testResult}</Text>
								</Box>
							)}
							{endpoints.map((ep, i) => (
								<Box key={ep.id}>
									<Text color={i === selected ? 'white' : 'gray'}>
										{i === selected ? '> ' : '  '}
									</Text>
									<Text bold={i === selected}>
										{ep.name.padEnd(15)}
									</Text>
									<Text dimColor>{ep.host}:{ep.port}</Text>
									{ep.isDefault && <Text color="green"> [default]</Text>}
									{ep.auth && <Text color="cyan"> [auth]</Text>}
								</Box>
							))}
						</>
					)}
				</>
			)}

			{/* Footer */}
			<Box marginTop={1}>
				<Text dimColor>
					Tab switch *
					{tab === 'browse' && 'f filter * p pull * '}
					{tab === 'installed' && 'Enter select * '}
					{tab === 'endpoints' && 'a add * t test * d delete * '}
					Esc close
				</Text>
			</Box>
		</Box>
	);
};
