import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { scheduler } from '../../core/scheduler.js';
import { bus } from '../../core/bus.js';

interface ScheduledTasksViewProps {
	onClose: () => void;
}

export const ScheduledTasksView: React.FC<ScheduledTasksViewProps> = ({ onClose }) => {
	const [tasks, setTasks] = useState<any[]>([]);
	const [selected, setSelected] = useState(0);

	const reload = () => {
		setTasks(scheduler.listTasks());
	};

	useEffect(() => { reload(); }, []);

	useInput(async (input, key) => {
		if (key.escape) {
			onClose();
			return;
		}
		if (key.upArrow) setSelected((p) => Math.max(0, p - 1));
		if (key.downArrow) setSelected((p) => Math.min(tasks.length - 1, p + 1));

		// Delete
		if ((input === 'd' || input === 'D') && tasks.length > 0) {
			const task = tasks[selected];
			try {
				await scheduler.removeTask(task.id);
				reload();
				setSelected(Math.min(selected, tasks.length - 2));
			} catch (err: any) {
				bus.emitAgent({ type: 'error', message: `Failed to delete: ${err.message}` });
			}
		}

		// Toggle enable/disable
		if ((input === 'e' || input === 'E') && tasks.length > 0) {
			const task = tasks[selected];
			try {
				if (task.enabled) {
					await scheduler.disableTask(task.id);
				} else {
					await scheduler.enableTask(task.id);
				}
				reload();
			} catch (err: any) {
				bus.emitAgent({ type: 'error', message: `Failed: ${err.message}` });
			}
		}
	});

	if (tasks.length === 0) {
		return (
			<Box flexDirection="column" paddingX={1}>
				<Box marginBottom={1}>
					<Text bold color="white">[ Scheduled Tasks ]</Text>
				</Box>
				<Text dimColor>No scheduled tasks. Use /schedule to create one.</Text>
				<Box marginTop={1}>
					<Text dimColor>Esc to close</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" paddingX={1} width="100%">
			<Box marginBottom={1}>
				<Text bold color="white">[ Scheduled Tasks ]</Text>
				<Text dimColor>  {tasks.length} tasks</Text>
			</Box>

			{tasks.map((task, i) => {
				const lastRun = task.last_run_at
					? new Date(task.last_run_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
					: 'never';
				const isSelected = i === selected;
				const enabled = task.enabled !== false;
				return (
					<Box key={task.id} flexDirection="column">
						<Box>
							<Text color={isSelected ? 'white' : 'gray'}>
								{isSelected ? '> ' : '  '}
							</Text>
							<Text color={enabled ? 'cyan' : 'gray'} bold={isSelected}>
								{task.command.padEnd(16)}
							</Text>
							<Text dimColor>{task.cron_expression.padEnd(18)}</Text>
							<Text dimColor>last: {lastRun}</Text>
							{!enabled && <Text color="red"> [disabled]</Text>}
						</Box>
					</Box>
				);
			})}

			<Box marginTop={1}>
				<Text dimColor>e toggle * d delete * Esc to close</Text>
			</Box>
		</Box>
	);
};
