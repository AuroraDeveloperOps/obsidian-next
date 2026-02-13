import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { keyManager } from '../../core/keyManager.js';
import { config } from '../../core/config.js';
import { settings } from '../../core/settings.js';
import { context } from '../../core/context.js';
import {
	detectOllama,
	validateKeyFormat,
	testClaudeKey
} from '../../utils/setup-helpers.js';
import { getRecommendedModels, OllamaModelEntry } from '../../core/ollama-registry.js';

interface InitViewProps {
	onClose: () => void;
}

type WizardStep =
	| 'welcome'
	| 'provider'
	| 'claude_key'
	| 'ollama_endpoint'
	| 'model'
	| 'mode'
	| 'test'
	| 'success';

// Claude models for selection
const CLAUDE_MODELS = [
	{ id: 'claude-opus-4-6-20260207', label: 'Opus 4.6', desc: 'Most intelligent, highest quality' },
	{ id: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5', desc: 'Balanced speed and quality' },
	{ id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', desc: 'Fastest, most economical' },
];

const MODE_OPTIONS = [
	{ id: 'safe', label: 'Safe', desc: 'Read ops auto-approve, writes require approval (recommended)' },
	{ id: 'plan', label: 'Plan', desc: 'Read-only planning, full approval before execution' },
	{ id: 'auto', label: 'Auto', desc: 'Execute all without confirmation (advanced users)' },
];

export const InitView = ({ onClose }: InitViewProps) => {
	const [step, setStep] = useState<WizardStep>('welcome');
	const [provider, setProvider] = useState<'claude' | 'ollama'>('claude');
	const [selected, setSelected] = useState(0);

	// Claude key
	const [apiKey, setApiKey] = useState('');
	const [keyError, setKeyError] = useState('');

	// Ollama
	const [ollamaHost, setOllamaHost] = useState('localhost');
	const [ollamaPort, setOllamaPort] = useState('11434');
	const [ollamaDetected, setOllamaDetected] = useState(false);
	const [ollamaModels, setOllamaModels] = useState<string[]>([]);
	const [ollamaError, setOllamaError] = useState('');
	const [recommendedModels, setRecommendedModels] = useState<OllamaModelEntry[]>([]);

	// Model selection
	const [selectedModel, setSelectedModel] = useState('');

	// Mode selection
	const [selectedMode, setSelectedMode] = useState('safe');

	// Test results
	const [testResults, setTestResults] = useState<Array<{ label: string; status: 'pending' | 'ok' | 'fail'; detail?: string }>>([]);
	const [testDone, setTestDone] = useState(false);

	// Config summary
	const [summary, setSummary] = useState<Record<string, string>>({});

	// Auto-detect Ollama on endpoint step
	useEffect(() => {
		if (step === 'ollama_endpoint') {
			checkOllama();
		}
	}, [step]);

	// Load recommended models
	useEffect(() => {
		setRecommendedModels(getRecommendedModels());
	}, []);

	const checkOllama = async () => {
		setOllamaError('');
		const result = await detectOllama(ollamaHost, parseInt(ollamaPort) || 11434);
		setOllamaDetected(result.available);
		setOllamaModels(result.models);
		if (!result.available) {
			setOllamaError(result.error || 'Not available');
		}
	};

	// Run connection test
	useEffect(() => {
		if (step === 'test') {
			runTests();
		}
	}, [step]);

	const runTests = async () => {
		const results: typeof testResults = [];

		if (provider === 'claude') {
			results.push({ label: 'API Key format', status: 'pending' });
			results.push({ label: 'API connection', status: 'pending' });
			results.push({ label: 'Save configuration', status: 'pending' });
			setTestResults([...results]);

			// Test 1: Key format
			const valid = validateKeyFormat(apiKey);
			results[0].status = valid ? 'ok' : 'fail';
			if (!valid) results[0].detail = 'Invalid format';
			setTestResults([...results]);

			// Test 2: API connection
			if (valid) {
				const test = await testClaudeKey(apiKey);
				results[1].status = test.valid ? 'ok' : 'fail';
				if (!test.valid) results[1].detail = test.error;
				setTestResults([...results]);
			} else {
				results[1].status = 'fail';
				results[1].detail = 'Skipped (invalid key)';
				setTestResults([...results]);
			}

			// Test 3: Save config
			try {
				const storeResult = await keyManager.storeKey(apiKey.trim());
				if (!storeResult.success) throw new Error(storeResult.error);
				const cfg = await config.load();
				await config.save({ ...cfg, model: selectedModel, provider: 'anthropic' as any });
				await settings.save({ mode: selectedMode as any });
				results[2].status = 'ok';
			} catch (err: any) {
				results[2].status = 'fail';
				results[2].detail = err.message;
			}
			setTestResults([...results]);
		} else {
			// Ollama tests
			results.push({ label: 'Ollama connection', status: 'pending' });
			results.push({ label: 'Model available', status: 'pending' });
			results.push({ label: 'Save configuration', status: 'pending' });
			setTestResults([...results]);

			// Test 1: Connection
			const detect = await detectOllama(ollamaHost, parseInt(ollamaPort) || 11434);
			results[0].status = detect.available ? 'ok' : 'fail';
			if (!detect.available) results[0].detail = detect.error;
			setTestResults([...results]);

			// Test 2: Model check
			if (detect.available) {
				const hasModel = detect.models.some((m) => m.includes(selectedModel.split(':')[0]));
				results[1].status = hasModel ? 'ok' : 'fail';
				if (!hasModel) results[1].detail = `${selectedModel} not installed locally`;
			} else {
				results[1].status = 'fail';
				results[1].detail = 'Skipped';
			}
			setTestResults([...results]);

			// Test 3: Save config
			try {
				const cfg = await config.load();
				await config.save({
					...cfg,
					provider: 'ollama' as any,
					ollama: {
						...cfg.ollama,
						baseUrl: `http://${ollamaHost}:${ollamaPort}`,
						models: { ...(cfg.ollama?.models || {}), chat: selectedModel, tool: selectedModel }
					}
				});
				await settings.save({ mode: selectedMode as any });
				results[2].status = 'ok';
			} catch (err: any) {
				results[2].status = 'fail';
				results[2].detail = err.message;
			}
			setTestResults([...results]);
		}

		setTestDone(true);

		// Build summary
		setSummary({
			Provider: provider === 'claude' ? 'Anthropic (Claude)' : 'Ollama (Local)',
			Model: selectedModel,
			Mode: selectedMode,
		});
	};

	// Navigate steps backward
	const goBack = () => {
		switch (step) {
			case 'provider': setStep('welcome'); break;
			case 'claude_key': setStep('provider'); break;
			case 'ollama_endpoint': setStep('provider'); break;
			case 'model': setStep(provider === 'claude' ? 'claude_key' : 'ollama_endpoint'); break;
			case 'mode': setStep('model'); break;
			case 'test': setStep('mode'); break;
			case 'success': onClose(); break;
			default: onClose();
		}
	};

	useInput((input, key) => {
		if (key.escape) {
			goBack();
			return;
		}

		// Welcome step
		if (step === 'welcome') {
			if (key.return) setStep('provider');
			return;
		}

		// Provider step
		if (step === 'provider') {
			if (key.upArrow || key.downArrow) {
				setSelected((p) => p === 0 ? 1 : 0);
			}
			if (key.return) {
				const p = selected === 0 ? 'claude' : 'ollama';
				setProvider(p);
				setStep(p === 'claude' ? 'claude_key' : 'ollama_endpoint');
				setSelected(0);
			}
			return;
		}

		// Model step
		if (step === 'model') {
			const models = provider === 'claude'
				? CLAUDE_MODELS
				: (ollamaModels.length > 0 ? ollamaModels.map((m) => ({ id: m, label: m, desc: '' })) : recommendedModels.map((m) => ({ id: m.name, label: m.displayName, desc: m.description })));

			if (key.upArrow) setSelected((p) => Math.max(0, p - 1));
			if (key.downArrow) setSelected((p) => Math.min(models.length - 1, p + 1));
			if (key.return && models.length > 0) {
				setSelectedModel(models[selected].id);
				setStep('mode');
				setSelected(0);
			}
			return;
		}

		// Mode step
		if (step === 'mode') {
			if (key.upArrow) setSelected((p) => Math.max(0, p - 1));
			if (key.downArrow) setSelected((p) => Math.min(MODE_OPTIONS.length - 1, p + 1));
			if (key.return) {
				setSelectedMode(MODE_OPTIONS[selected].id);
				setStep('test');
				setSelected(0);
			}
			return;
		}

		// Test step
		if (step === 'test' && testDone) {
			if (key.return) setStep('success');
			return;
		}

		// Success step
		if (step === 'success') {
			if (key.return) onClose();
			return;
		}
	});

	// Step indicator
	const steps: WizardStep[] = ['welcome', 'provider', provider === 'claude' ? 'claude_key' : 'ollama_endpoint', 'model', 'mode', 'test', 'success'];
	const currentIdx = steps.indexOf(step);
	const stepLabel = `Step ${Math.max(1, currentIdx)} of ${steps.length - 1}`;

	return (
		<Box flexDirection="column" paddingX={2} width="100%">
			{/* Header */}
			<Box marginBottom={1} justifyContent="space-between">
				<Text bold color="white">[ Setup Wizard ]</Text>
				{step !== 'welcome' && step !== 'success' && (
					<Text dimColor>{stepLabel}</Text>
				)}
			</Box>

			{/* Welcome */}
			{step === 'welcome' && (
				<Box flexDirection="column">
					<Text bold>Welcome to Obsidian Next</Text>
					<Text> </Text>
					<Text>This wizard will help you configure:</Text>
					<Text dimColor>  1. Provider (Claude API or Ollama local models)</Text>
					<Text dimColor>  2. API key or endpoint</Text>
					<Text dimColor>  3. Model selection</Text>
					<Text dimColor>  4. Execution mode</Text>
					<Text dimColor>  5. Connection test</Text>
					<Text> </Text>
					<Text dimColor>Press Enter to begin, Esc to skip.</Text>
				</Box>
			)}

			{/* Provider Selection */}
			{step === 'provider' && (
				<Box flexDirection="column">
					<Text bold>Select Provider</Text>
					<Text> </Text>
					<Box flexDirection="column">
						<Box>
							<Text color={selected === 0 ? 'white' : 'gray'}>
								{selected === 0 ? '> ' : '  '}
							</Text>
							<Text bold={selected === 0} color="cyan">Claude (Recommended)</Text>
						</Box>
						{selected === 0 && (
							<Box marginLeft={4}>
								<Text dimColor>Cloud API. Most capable models. Requires API key from console.anthropic.com</Text>
							</Box>
						)}
						<Box>
							<Text color={selected === 1 ? 'white' : 'gray'}>
								{selected === 1 ? '> ' : '  '}
							</Text>
							<Text bold={selected === 1}>Ollama (Offline)</Text>
						</Box>
						{selected === 1 && (
							<Box marginLeft={4}>
								<Text dimColor>Local models. No API key needed. Requires Ollama installed.</Text>
							</Box>
						)}
					</Box>
				</Box>
			)}

			{/* Claude API Key */}
			{step === 'claude_key' && (
				<Box flexDirection="column">
					<Text bold>Anthropic API Key</Text>
					<Text dimColor>Get one at console.anthropic.com</Text>
					<Text> </Text>
					<Box>
						<Text>Key: </Text>
						<TextInput
							value={apiKey}
							onChange={(v) => { setApiKey(v); setKeyError(''); }}
							onSubmit={() => {
								if (!apiKey.trim()) {
									setKeyError('API key cannot be empty');
									return;
								}
								if (!validateKeyFormat(apiKey.trim())) {
									setKeyError('Invalid key format (should start with sk-ant-)');
									return;
								}
								setStep('model');
								setSelected(0);
							}}
							placeholder="sk-ant-..."
							mask="*"
						/>
					</Box>
					{keyError && (
						<Box marginTop={1}>
							<Text color="red">[ERR] {keyError}</Text>
						</Box>
					)}
				</Box>
			)}

			{/* Ollama Endpoint */}
			{step === 'ollama_endpoint' && (
				<Box flexDirection="column">
					<Text bold>Ollama Endpoint</Text>
					<Text> </Text>
					{ollamaDetected ? (
						<>
							<Text color="green">Ollama detected at {ollamaHost}:{ollamaPort}</Text>
							<Text dimColor>{ollamaModels.length} model(s) installed</Text>
							<Text> </Text>
							<Text dimColor>Press Enter to continue</Text>
						</>
					) : (
						<>
							<Text color="red">Ollama not detected: {ollamaError}</Text>
							<Text> </Text>
							<Text dimColor>Start Ollama with: ollama serve</Text>
							<Text dimColor>Or enter a custom host below:</Text>
							<Box marginTop={1}>
								<Text>Host: </Text>
								<TextInput
									value={ollamaHost}
									onChange={setOllamaHost}
									onSubmit={async () => {
										await checkOllama();
										if (ollamaDetected) {
											setStep('model');
											setSelected(0);
										}
									}}
									placeholder="localhost"
								/>
							</Box>
						</>
					)}
				</Box>
			)}

			{/* Model Selection */}
			{step === 'model' && (
				<Box flexDirection="column">
					<Text bold>Select Model</Text>
					<Text> </Text>
					{provider === 'claude' ? (
						CLAUDE_MODELS.map((model, i) => (
							<Box key={model.id} flexDirection="column">
								<Box>
									<Text color={i === selected ? 'white' : 'gray'}>
										{i === selected ? '> ' : '  '}
									</Text>
									<Text bold={i === selected}>{model.label}</Text>
								</Box>
								{i === selected && (
									<Box marginLeft={4}>
										<Text dimColor>{model.desc}</Text>
									</Box>
								)}
							</Box>
						))
					) : ollamaModels.length > 0 ? (
						<>
							<Text dimColor>Installed models:</Text>
							{ollamaModels.map((model, i) => (
								<Box key={model}>
									<Text color={i === selected ? 'white' : 'gray'}>
										{i === selected ? '> ' : '  '}
									</Text>
									<Text bold={i === selected}>{model}</Text>
								</Box>
							))}
						</>
					) : (
						<>
							<Text dimColor>Recommended models (will need to pull):</Text>
							{recommendedModels.map((model, i) => (
								<Box key={model.name} flexDirection="column">
									<Box>
										<Text color={i === selected ? 'white' : 'gray'}>
											{i === selected ? '> ' : '  '}
										</Text>
										<Text bold={i === selected}>{model.displayName}</Text>
										<Text dimColor> ({model.size})</Text>
									</Box>
									{i === selected && (
										<Box marginLeft={4}>
											<Text dimColor>{model.description}</Text>
										</Box>
									)}
								</Box>
							))}
						</>
					)}
				</Box>
			)}

			{/* Mode Selection */}
			{step === 'mode' && (
				<Box flexDirection="column">
					<Text bold>Execution Mode</Text>
					<Text> </Text>
					{MODE_OPTIONS.map((mode, i) => (
						<Box key={mode.id} flexDirection="column">
							<Box>
								<Text color={i === selected ? 'white' : 'gray'}>
									{i === selected ? '> ' : '  '}
								</Text>
								<Text bold={i === selected} color={mode.id === 'safe' ? 'red' : mode.id === 'plan' ? 'yellow' : 'green'}>
									{mode.label}
								</Text>
							</Box>
							{i === selected && (
								<Box marginLeft={4}>
									<Text dimColor>{mode.desc}</Text>
								</Box>
							)}
						</Box>
					))}
				</Box>
			)}

			{/* Connection Test */}
			{step === 'test' && (
				<Box flexDirection="column">
					<Text bold>Connection Test</Text>
					<Text> </Text>
					{testResults.map((result, i) => (
						<Box key={i}>
							<Text>
								{result.status === 'ok' ? <Text color="green">[OK] </Text> :
								 result.status === 'fail' ? <Text color="red">[FAIL] </Text> :
								 <Text dimColor>[...] </Text>}
							</Text>
							<Text>{result.label}</Text>
							{result.detail && <Text dimColor> - {result.detail}</Text>}
						</Box>
					))}
					{testDone && (
						<Box marginTop={1}>
							<Text dimColor>Press Enter to continue</Text>
						</Box>
					)}
				</Box>
			)}

			{/* Success */}
			{step === 'success' && (
				<Box flexDirection="column">
					<Text bold color="green">Setup Complete</Text>
					<Text> </Text>
					{Object.entries(summary).map(([key, val]) => (
						<Text key={key}>   {key.padEnd(12)} <Text dimColor>{val}</Text></Text>
					))}
					<Text> </Text>
					<Text bold color="gray">Quick Tips</Text>
					<Text dimColor>   Shift+Tab to cycle modes</Text>
					<Text dimColor>   / to open command menu</Text>
					<Text dimColor>   Ctrl+C to exit</Text>
					<Text> </Text>
					<Text dimColor>Press Enter to start using Obsidian Next</Text>
				</Box>
			)}

			{/* Footer */}
			{step !== 'welcome' && step !== 'success' && (
				<Box marginTop={1}>
					<Text dimColor>Enter to continue * Esc to go back</Text>
				</Box>
			)}
		</Box>
	);
};
