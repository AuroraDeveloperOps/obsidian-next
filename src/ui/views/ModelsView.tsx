import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { config } from '../../core/config.js';
import { bus } from '../../core/bus.js';

interface ModelsViewProps {
	onClose: () => void;
}

interface ModelEntry {
	id: string;
	label: string;
	provider: 'anthropic' | 'ollama' | 'moe';
	desc?: string;
}

const CLAUDE_MODELS: ModelEntry[] = [
	{ id: 'claude-opus-4-6-20260207', label: 'Opus 4.6', provider: 'anthropic', desc: 'Most intelligent' },
	{ id: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5', provider: 'anthropic', desc: 'Balanced' },
	{ id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', provider: 'anthropic', desc: 'Fast' },
	{ id: 'claude-opus-4-5-20251101', label: 'Opus 4.5', provider: 'anthropic', desc: 'Legacy Pro' },
];

export const ModelsView: React.FC<ModelsViewProps> = ({ onClose }) => {
	const [allModels, setAllModels] = useState<ModelEntry[]>([]);
	const [selected, setSelected] = useState(0);
	const [currentModel, setCurrentModel] = useState('');
	const [currentProvider, setCurrentProvider] = useState('anthropic');

	useEffect(() => {
		const load = async () => {
			const cfg = await config.load();
			setCurrentModel(cfg.model);
			setCurrentProvider((cfg as any).provider || 'anthropic');

			const models: ModelEntry[] = [...CLAUDE_MODELS];

			// Fetch Ollama models
			const baseUrl = cfg.ollama?.baseUrl || 'http://localhost:11434';
			try {
				const response = await fetch(`${baseUrl}/api/tags`, {
					signal: AbortSignal.timeout(2000)
				});
				if (response.ok) {
					const data = await response.json();
					const ollamaModels = (data.models || []).map((m: any) => ({
						id: m.name,
						label: m.name,
						provider: 'ollama' as const,
						desc: `${(m.size / 1e9).toFixed(1)}GB`
					}));
					models.push(...ollamaModels);
				}
			} catch {}

			models.push({ id: 'moe', label: 'MoE (Intelligent Routing)', provider: 'moe', desc: 'Routes to best model' });
			setAllModels(models);
		};
		load();
	}, []);

	useInput(async (_, key) => {
		if (key.escape) {
			onClose();
			return;
		}
		if (key.upArrow) setSelected((p) => Math.max(0, p - 1));
		if (key.downArrow) setSelected((p) => Math.min(allModels.length - 1, p + 1));
		if (key.return && allModels.length > 0) {
			const model = allModels[selected];
			const cfg = await config.load();
			const newConfig = { ...cfg } as any;

			if (model.provider === 'anthropic') {
				newConfig.provider = 'anthropic';
				newConfig.model = model.id;
			} else if (model.provider === 'ollama') {
				newConfig.provider = 'ollama';
				newConfig.ollama = {
					...cfg.ollama,
					models: { ...(cfg.ollama?.models || {}), chat: model.id, tool: cfg.ollama?.models?.tool || model.id }
				};
			} else if (model.provider === 'moe') {
				newConfig.provider = 'moe';
			}

			await config.save(newConfig);
			setCurrentModel(model.id);
			setCurrentProvider(model.provider);
			bus.emitAgent({ type: 'done', summary: `Switched to ${model.label}` });
			onClose();
		}
	});

	// Group by provider
	const claudeModels = allModels.filter((m) => m.provider === 'anthropic');
	const ollamaModels = allModels.filter((m) => m.provider === 'ollama');
	const special = allModels.filter((m) => m.provider === 'moe');

	let globalIdx = 0;

	const renderModel = (model: ModelEntry) => {
		const idx = globalIdx++;
		const isCurrent = model.provider === currentProvider &&
			(model.provider === 'moe' || model.id === currentModel ||
			 (model.provider === 'ollama' && model.id === currentModel));
		const isSelected = idx === selected;

		return (
			<Box key={`${model.provider}-${model.id}`}>
				<Text color={isSelected ? 'white' : 'gray'}>
					{isSelected ? '> ' : '  '}
				</Text>
				<Text bold={isSelected}>
					{model.label.padEnd(30)}
				</Text>
				{isCurrent && <Text color="green"> [Active]</Text>}
				{model.desc && !isCurrent && <Text dimColor> {model.desc}</Text>}
			</Box>
		);
	};

	return (
		<Box flexDirection="column" paddingX={1} width="100%">
			<Box marginBottom={1}>
				<Text bold color="white">[ Model Selection ]</Text>
				<Text dimColor>  Provider: {currentProvider}</Text>
			</Box>

			{claudeModels.length > 0 && (
				<>
					<Text bold color="gray">Claude</Text>
					{claudeModels.map(renderModel)}
					<Text> </Text>
				</>
			)}

			{ollamaModels.length > 0 && (
				<>
					<Text bold color="gray">Ollama (Local)</Text>
					{ollamaModels.map(renderModel)}
					<Text> </Text>
				</>
			)}

			{ollamaModels.length === 0 && (
				<>
					<Text bold color="gray">Ollama (Local)</Text>
					<Text dimColor>   No models found. Run /ollama to set up.</Text>
					<Text> </Text>
				</>
			)}

			{special.map(renderModel)}

			<Box marginTop={1}>
				<Text dimColor>Enter to select * Esc to close</Text>
			</Box>
		</Box>
	);
};
