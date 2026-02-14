import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { skillsManager, type SkillMeta } from '../../core/skills.js';
import { tools } from '../../tools/index.js';

interface SkillsViewProps {
	onExit: () => void;
}

type ViewMode = 'list' | 'detail';

export const SkillsView: React.FC<SkillsViewProps> = ({ onExit }) => {
	const [skills, setSkills] = useState<SkillMeta[]>([]);
	const [selected, setSelected] = useState(0);
	const [mode, setMode] = useState<ViewMode>('list');
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = async () => {
		try {
			await skillsManager.init();
			const all = await skillsManager.listAll();
			setSkills(all);
			if (selected >= all.length) setSelected(Math.max(0, all.length - 1));
		} catch (e: any) {
			setError(e.message);
		}
		setLoading(false);
	};

	useEffect(() => {
		refresh();
	}, []);

	useInput(async (input, key) => {
		if (mode === 'detail') {
			if (key.escape) {
				setMode('list');
				return;
			}
			return;
		}

		// List mode
		if (key.escape) {
			onExit();
			return;
		}

		if (key.upArrow) {
			setSelected(p => (p > 0 ? p - 1 : Math.max(0, skills.length - 1)));
			setStatus(null);
			setError(null);
		}
		if (key.downArrow) {
			setSelected(p => (p < skills.length - 1 ? p + 1 : 0));
			setStatus(null);
			setError(null);
		}

		if (skills.length === 0) return;
		const skill = skills[selected];

		// Toggle enable/disable
		if (key.return || input === 't') {
			try {
				if (skill.enabled) {
					await skillsManager.disable(skill.name);
					// Unregister from tool registry
					setStatus(`Disabled '${skill.name}' - will take effect on restart`);
				} else {
					await skillsManager.enable(skill.name);
					setStatus(`Enabled '${skill.name}' - will take effect on restart`);
				}
				await refresh();
			} catch (e: any) {
				setError(e.message);
			}
		}

		// View detail
		if (input === 'v') {
			setMode('detail');
		}

		// Remove user skill
		if ((input === 'r' || key.delete) && skill.source === 'user') {
			const ok = await skillsManager.remove(skill.name);
			if (ok) {
				setStatus(`Removed '${skill.name}'`);
				await refresh();
			} else {
				setError(`Cannot remove '${skill.name}'`);
			}
		}

		// Copy default to user dir for customization
		if (input === 'c' && skill.source === 'default') {
			const ok = await skillsManager.copyToUser(skill.name);
			if (ok) {
				setStatus(`Copied '${skill.name}' to user skills for customization`);
				await refresh();
			} else {
				setError(`Failed to copy '${skill.name}'`);
			}
		}

		// Reload all skills
		if (input === 'l') {
			setLoading(true);
			setStatus('Reloading skills...');
			try {
				await tools.init();
				await refresh();
				setStatus('Skills reloaded');
			} catch (e: any) {
				setError(e.message);
			}
			setLoading(false);
		}
	});

	// Scrolling
	const VISIBLE = 8;
	const startIdx = Math.max(0, Math.min(selected - Math.floor(VISIBLE / 2), skills.length - VISIBLE));
	const endIdx = Math.min(startIdx + VISIBLE, skills.length);
	const visible = skills.slice(startIdx, endIdx);

	if (loading) {
		return (
			<Box flexDirection="column" paddingX={1}>
				<Text color="gray">Loading skills...</Text>
			</Box>
		);
	}

	// Detail view
	if (mode === 'detail' && skills[selected]) {
		const s = skills[selected];
		return (
			<Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="gray">
				<Box marginBottom={1} borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderBottom={true} borderColor="gray">
					<Text bold color="cyan">SKILL DETAIL</Text>
				</Box>
				<Box flexDirection="column" gap={0}>
					<Text><Text bold>Name: </Text><Text color="white">{s.name}</Text></Text>
					<Text><Text bold>Source: </Text><Text color={s.source === 'default' ? 'yellow' : 'green'}>{s.source}</Text></Text>
					<Text><Text bold>Status: </Text><Text color={s.enabled ? 'green' : 'red'}>{s.enabled ? 'Enabled' : 'Disabled'}</Text></Text>
					<Text><Text bold>File: </Text><Text color="gray">{s.filename}</Text></Text>
					<Box marginTop={1}>
						<Text><Text bold>Description: </Text></Text>
					</Box>
					<Text color="gray" wrap="wrap">{s.description || 'No description'}</Text>
				</Box>
				<Box marginTop={1} borderStyle="single" borderTop={true} borderLeft={false} borderRight={false} borderBottom={false} borderColor="gray">
					<Text color="gray"><Text bold>Esc</Text> Back</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="gray">
			{/* Header */}
			<Box marginBottom={1} borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderBottom={true} borderColor="gray">
				<Text bold color="cyan">SKILLS STORE</Text>
				<Text color="gray">  {skills.filter(s => s.enabled).length}/{skills.length} active</Text>
			</Box>

			{/* Status messages */}
			{error && (
				<Box marginBottom={1}>
					<Text color="red">[ERROR] {error}</Text>
				</Box>
			)}
			{status && (
				<Box marginBottom={1}>
					<Text color="green">{status}</Text>
				</Box>
			)}

			{/* Column headers */}
			<Box flexDirection="row" marginBottom={1}>
				<Box width={4}><Text color="gray" bold>  </Text></Box>
				<Box width={22}><Text color="gray" bold>Skill</Text></Box>
				<Box width={10}><Text color="gray" bold>Source</Text></Box>
				<Box width={10}><Text color="gray" bold>Status</Text></Box>
				<Box flexGrow={1}><Text color="gray" bold>Description</Text></Box>
			</Box>

			{skills.length === 0 ? (
				<Box paddingY={2} justifyContent="center">
					<Text color="gray">No skills found. Create one with /tool create_skill or add .mjs files to ~/.obsidian-next/skills/</Text>
				</Box>
			) : (
				visible.map((s, idx) => {
					const realIndex = startIdx + idx;
					const isSel = realIndex === selected;
					return (
						<Box key={s.name} flexDirection="row">
							<Box width={4}>
								<Text color={isSel ? 'cyan' : 'white'}>{isSel ? '> ' : '  '}</Text>
							</Box>
							<Box width={22}>
								<Text color={isSel ? 'cyan' : 'white'} bold={isSel}>
									{s.name}
								</Text>
							</Box>
							<Box width={10}>
								<Text color={s.source === 'default' ? 'yellow' : 'green'}>
									{s.source}
								</Text>
							</Box>
							<Box width={10}>
								<Text color={s.enabled ? 'green' : 'red'}>
									{s.enabled ? 'ON' : 'OFF'}
								</Text>
							</Box>
							<Box flexGrow={1}>
								<Text color="gray" wrap="truncate-end">
									{s.description.slice(0, 50)}
								</Text>
							</Box>
						</Box>
					);
				})
			)}

			{/* Scroll indicator */}
			{skills.length > VISIBLE && (
				<Box marginTop={1}>
					<Text color="gray">[{startIdx + 1}-{endIdx} of {skills.length}]</Text>
				</Box>
			)}

			{/* Footer */}
			<Box marginTop={1} borderStyle="single" borderTop={true} borderLeft={false} borderRight={false} borderBottom={false} borderColor="gray">
				<Text>
					<Text bold color="white">Enter</Text> <Text color="gray">Toggle</Text>
					<Text color="gray"> · </Text>
					<Text bold color="white">V</Text> <Text color="gray">Detail</Text>
					<Text color="gray"> · </Text>
					<Text bold color="white">C</Text> <Text color="gray">Customize</Text>
					<Text color="gray"> · </Text>
					<Text bold color="red">R</Text> <Text color="gray">Remove</Text>
					<Text color="gray"> · </Text>
					<Text bold color="white">L</Text> <Text color="gray">Reload</Text>
					<Text color="gray"> · </Text>
					<Text bold>Esc</Text> <Text color="gray">Back</Text>
				</Text>
			</Box>
		</Box>
	);
};
