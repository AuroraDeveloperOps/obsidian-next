import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { usage } from '../../core/usage.js';
import { config } from '../../core/config.js';

interface UsageViewProps {
	onClose: () => void;
}

export const UsageView: React.FC<UsageViewProps> = ({ onClose }) => {
	const [stats, setStats] = useState(usage.getStats());
	const [contextStats, setContextStats] = useState({
		used: 0,
		cached: 0,
		limit: 200000
	});
	const [model, setModel] = useState('loading...');

	// Refresh stats on mount
	useEffect(() => {
		const load = async () => {
			await usage.init();
			const cfg = await config.load();
			
			const conf = cfg as any;
			let displayModel = cfg.model;
			if (conf.provider === 'ollama') {
				displayModel = conf.ollama?.models?.chat || 'Unknown Ollama Model';
			} else if (conf.provider === 'moe') {
				displayModel = 'MoE (Auto)';
			}
			
			const ctx = usage.getContextUsage(displayModel);
			
			setModel(displayModel);
			setStats(usage.getStats());
			setContextStats({
				used: ctx.used,
				cached: ctx.cached,
				limit: ctx.limit
			});
		};
		load();
	}, []);

	useInput((_, key) => {
		if (key.escape || key.return) {
			onClose();
		}
	});

	const formatCurrency = (amount: number) => `$${amount.toFixed(4)}`;

	// Grid Generation Logic
	const LIMIT = contextStats.limit;
	const BUFFER_SIZE = LIMIT * 0.1;
	const USABLE_LIMIT = LIMIT - BUFFER_SIZE;
	const TOTAL_BLOCKS = 100; // 10x10
	const TOKENS_PER_BLOCK = LIMIT / TOTAL_BLOCKS;

	const cachedTokens = contextStats.cached;
	const activeTokens = Math.max(0, contextStats.used - cachedTokens);
	const freeTokens = Math.max(0, USABLE_LIMIT - contextStats.used);
	const bufferTokens = BUFFER_SIZE;

	const cachedBlocks = Math.ceil(cachedTokens / TOKENS_PER_BLOCK);
	const activeBlocks = Math.ceil(activeTokens / TOKENS_PER_BLOCK);
	const bufferBlocks = Math.ceil(bufferTokens / TOKENS_PER_BLOCK);
	const freeBlocks = Math.max(
		0,
		TOTAL_BLOCKS - cachedBlocks - activeBlocks - bufferBlocks
	);

	const blocks: string[] = [];
	for (let i = 0; i < cachedBlocks; i++) blocks.push('cyan');
	for (let i = 0; i < activeBlocks; i++) blocks.push('white');
	for (let i = 0; i < freeBlocks; i++) blocks.push('dim');
	for (let i = 0; i < bufferBlocks; i++) blocks.push('red');

	// Ensure strictly 100 blocks
	const safeBlocks = blocks.slice(0, 100);
	while (safeBlocks.length < 100) safeBlocks.push('red');

	// Prepare Legend Data
	const p = (val: number) => ((val / LIMIT) * 100).toFixed(1) + '%';
	const k = (val: number) => (val / 1000).toFixed(1) + 'k';

	// Rows for grid
	const rows = [];
	for (let i = 0; i < 10; i++) {
		rows.push(safeBlocks.slice(i * 10, (i + 1) * 10));
	}

	return (
		<Box
			flexDirection="column"
			width="100%"
			height="100%"
			paddingX={1}
			paddingY={0}
		>
			{/* Header */}
			<Box marginBottom={1}>
				<Text bold color="white">
					[ Context & Cost Analysis ]
				</Text>
			</Box>

			{/* Grid & Legend Layout */}
			<Box flexDirection="row">
				{/* Visual Grid */}
				<Box flexDirection="column" marginRight={2}>
					{rows.map((row, rowIdx) => (
						<Box key={rowIdx} flexDirection="row">
							{row.map((color, colIdx) => (
								<Text key={colIdx} color={color} dimColor={color === 'dim'}>
									{color === 'dim' ? '⛶ ' : color === 'red' ? '⛝ ' : '⛁ '}
								</Text>
							))}
						</Box>
					))}
				</Box>

				{/* Legend Side Panel */}
				<Box flexDirection="column">
					<Text bold>Estimated usage by category</Text>
					<Box flexDirection="row">
						<Text color="cyan">⛁ System/Tools: </Text>
						<Text>
							{k(cachedTokens).padStart(5)} ({p(cachedTokens)})
						</Text>
					</Box>
					<Box flexDirection="row">
						<Text color="white">⛁ Messages: </Text>
						<Text>
							{k(activeTokens).padStart(5)} ({p(activeTokens)})
						</Text>
					</Box>
					<Box flexDirection="row">
						<Text color="gray" dimColor>
							⛶ Free space:{' '}
						</Text>
						<Text dimColor>
							{k(freeTokens).padStart(5)} ({p(freeTokens)})
						</Text>
					</Box>
					<Box flexDirection="row" marginBottom={1}>
						<Text color="red">⛝ Safety Buffer: </Text>
						<Text>
							{k(bufferTokens).padStart(5)} ({p(bufferTokens)})
						</Text>
					</Box>

					<Text bold>Context Usage</Text>
					<Text>
						{model} · {k(contextStats.used)}/{k(LIMIT)} ({p(contextStats.used)})
					</Text>
					<Box marginTop={1}>
						<Text color="gray">Session Cost: </Text>
						<Text color="green">{formatCurrency(usage.getSessionCost())}</Text>
					</Box>
				</Box>
			</Box>

			{/* Simplified Token Flow & Footer (Below Grid) */}
			<Box flexDirection="column" marginTop={1}>
				<Box flexDirection="row" justifyContent="space-between">
					<Box flexDirection="column">
						<Text color="gray">Session Tokens</Text>
						<Text>
							{usage.getSessionTokens().input.toLocaleString()} In ·{' '}
							{usage.getSessionTokens().output.toLocaleString()} Out
						</Text>
					</Box>
					<Box flexDirection="column" alignItems="flex-end">
						<Text dimColor color="gray">
							Lifetime: {usage.getStats().totalInputTokens.toLocaleString()} In
						</Text>
						<Text dimColor color="gray">
							Esc to close
						</Text>
					</Box>
				</Box>
			</Box>
		</Box>
	);
};
