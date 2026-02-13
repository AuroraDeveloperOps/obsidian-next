import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { scheduler } from '../../core/scheduler.js';
import { bus } from '../../core/bus.js';

interface SchedulerViewProps {
	onClose: () => void;
}

type Step = 'cron' | 'ability' | 'params' | 'confirm';

const CRON_PRESETS = [
	{ label: 'Every minute', value: '* * * * *' },
	{ label: 'Every 5 minutes', value: '*/5 * * * *' },
	{ label: 'Every hour', value: '0 * * * *' },
	{ label: 'Every day at midnight', value: '0 0 * * *' },
	{ label: 'Custom...', value: '' },
];

export const SchedulerView: React.FC<SchedulerViewProps> = ({ onClose }) => {
	const [step, setStep] = useState<Step>('cron');
	const [cronSelected, setCronSelected] = useState(0);
	const [cronValue, setCronValue] = useState('');
	const [customCron, setCustomCron] = useState('');
	const [ability, setAbility] = useState('');
	const [params, setParams] = useState('{}');

	useInput((_, key) => {
		if (key.escape) {
			if (step === 'cron') onClose();
			else if (step === 'ability') setStep('cron');
			else if (step === 'params') setStep('ability');
			else if (step === 'confirm') setStep('params');
			return;
		}

		if (step === 'cron' && cronValue === '') {
			if (key.upArrow) setCronSelected((p) => Math.max(0, p - 1));
			if (key.downArrow) setCronSelected((p) => Math.min(CRON_PRESETS.length - 1, p + 1));
			if (key.return) {
				const preset = CRON_PRESETS[cronSelected];
				if (preset.value) {
					setCronValue(preset.value);
					setStep('ability');
				} else {
					setCronValue('custom');
				}
			}
		}
	});

	const handleCronSubmit = () => {
		if (customCron.trim()) {
			setCronValue(customCron.trim());
			setStep('ability');
		}
	};

	const handleAbilitySubmit = () => {
		if (ability.trim()) {
			setStep('params');
		}
	};

	const handleParamsSubmit = () => {
		setStep('confirm');
	};

	const handleConfirm = async () => {
		try {
			const parsedParams = JSON.parse(params);
			const task = await scheduler.scheduleTask(cronValue, ability, parsedParams);
			bus.emitAgent({ type: 'thought', content: `Scheduled task ${task.id}: ${ability} [${cronValue}]` });
			onClose();
		} catch (err: any) {
			bus.emitAgent({ type: 'error', message: `Failed: ${err.message}` });
			setStep('params');
		}
	};

	return (
		<Box flexDirection="column" paddingX={1} width="100%">
			<Box marginBottom={1}>
				<Text bold color="white">[ Schedule Task ]</Text>
			</Box>

			{step === 'cron' && cronValue === '' && (
				<>
					<Text bold color="gray">Select Schedule</Text>
					{CRON_PRESETS.map((preset, i) => (
						<Box key={i}>
							<Text color={i === cronSelected ? 'white' : 'gray'}>
								{i === cronSelected ? '> ' : '  '}
							</Text>
							<Text bold={i === cronSelected}>{preset.label}</Text>
							{preset.value && <Text dimColor>  ({preset.value})</Text>}
						</Box>
					))}
				</>
			)}

			{step === 'cron' && cronValue === 'custom' && (
				<Box>
					<Text>Cron: </Text>
					<TextInput
						value={customCron}
						onChange={setCustomCron}
						onSubmit={handleCronSubmit}
						placeholder="* * * * *"
					/>
				</Box>
			)}

			{step === 'ability' && (
				<Box flexDirection="column">
					<Text dimColor>Schedule: {cronValue}</Text>
					<Box marginTop={1}>
						<Text>Command: </Text>
						<TextInput
							value={ability}
							onChange={setAbility}
							onSubmit={handleAbilitySubmit}
							placeholder="system:echo"
						/>
					</Box>
				</Box>
			)}

			{step === 'params' && (
				<Box flexDirection="column">
					<Text dimColor>Schedule: {cronValue}</Text>
					<Text dimColor>Command: {ability}</Text>
					<Box marginTop={1}>
						<Text>Params (JSON): </Text>
						<TextInput
							value={params}
							onChange={setParams}
							onSubmit={handleParamsSubmit}
							placeholder="{}"
						/>
					</Box>
				</Box>
			)}

			{step === 'confirm' && (
				<Box flexDirection="column">
					<Text bold color="gray">Review</Text>
					<Text>   Schedule   <Text dimColor>{cronValue}</Text></Text>
					<Text>   Command    <Text dimColor>{ability}</Text></Text>
					<Text>   Params     <Text dimColor>{params}</Text></Text>
					<Box marginTop={1}>
						<Text>[Enter] Confirm   [Esc] Back</Text>
					</Box>
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>Esc to {step === 'cron' ? 'close' : 'go back'}</Text>
			</Box>
		</Box>
	);
};
