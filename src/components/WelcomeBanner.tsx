import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { context } from '../core/context.js';

/**
 * Block-character art for the welcome banner.
 *
 *  \u2590\u259B\u2588\u2588\u2588\u259C\u258C
 * \u259D\u259C\u2588\u2588\u2588\u2588\u2588\u259B\u2598
 *   \u2598\u2598 \u259D\u259D
 */
export function renderBannerArt(): string[] {
	return [
		' \u2590\u259B\u2588\u2588\u2588\u259C\u258C',
		'\u259D\u259C\u2588\u2588\u2588\u2588\u2588\u259B\u2598',
		'  \u2598\u2598 \u259D\u259D',
	];
}

interface WelcomeBannerProps {
	model: string;
	mode: string;
}

const formatModel = (m: string) => {
	if (m.includes('opus') && m.includes('4-6')) return 'Opus 4.6';
	if (m.includes('opus') && m.includes('4-5')) return 'Opus 4.5';
	if (m.includes('sonnet')) return 'Sonnet 4.5';
	if (m.includes('haiku')) return 'Haiku 4.5';
	if (m.length > 25) return m.slice(0, 25);
	return m;
};

const WelcomeBannerComponent: React.FC<WelcomeBannerProps> = ({ model, mode }) => {
	const art = renderBannerArt();
	const cwd = process.cwd();
	const home = process.env.HOME || process.env.USERPROFILE || '';
	const shortCwd = cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;

	return (
		<Box flexDirection="row" paddingX={1} marginBottom={1}>
			<Box flexDirection="column" marginRight={1}>
				<Text color="red" bold>{art[0]}</Text>
				<Text color="red">{art[1]}</Text>
				<Text color="red" dimColor>{art[2]}</Text>
			</Box>
			<Box flexDirection="column" justifyContent="center">
				<Text bold color="white">obsidian <Text dimColor>v1.0</Text></Text>
				<Text>{formatModel(model)} <Text dimColor>·</Text> <Text color={mode === 'auto' ? 'green' : mode === 'plan' ? 'yellow' : 'red'}>{mode} mode</Text></Text>
				<Text dimColor>{shortCwd}</Text>
			</Box>
		</Box>
	);
};

export const WelcomeBanner = React.memo(WelcomeBannerComponent);
