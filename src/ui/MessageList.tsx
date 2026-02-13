import React from 'react';
import { Box, Text } from 'ink';
import { AgentEvent } from '../events/types.js';
import { AgentLine } from '../components/AgentLine.js';
import { ToolOutput } from '../components/ToolOutput.js';
import { WelcomeBanner } from '../components/WelcomeBanner.js';

interface MessageListProps {
	events: AgentEvent[];
	maxEvents?: number;
	model?: string;
	mode?: string;
	version?: string;
}

/**
 * Format tool name to PascalCase display (bash -> Bash, web_fetch -> WebFetch)
 */
function formatToolName(tool: string): string {
	return tool
		.split(/[_-]/)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join('');
}

/**
 * Extract a short summary from tool args for display in parens
 */
function summarizeArgs(tool: string, argsJson: string): string {
	try {
		const args = JSON.parse(argsJson);
		const firstVal = Object.values(args)[0];
		if (typeof firstVal === 'string') {
			const cleaned = firstVal.trim();
			return cleaned.length > 60 ? cleaned.slice(0, 60) + '...' : cleaned;
		}
		return '';
	} catch {
		return '';
	}
}

const MessageListComponent: React.FC<MessageListProps> = ({
	events,
	maxEvents = 50,
	model = '',
	mode = 'safe',
	version = 'v1.0'
}) => {
	const visibleEvents = events.slice(-maxEvents);

	return (
		<Box flexDirection="column">
			{/* Welcome banner scrolls with the conversation */}
			<WelcomeBanner model={model} mode={mode} version={version} />

			{visibleEvents.map((event: any, i) => {
				const prevEvent = visibleEvents[i - 1];
				const nextEvent = visibleEvents[i + 1];
				let content = null;

				// Spacing: tool_result hugs its tool_start, everything else gets margin
				const isToolResult =
					event.type === 'tool_result' && prevEvent?.type === 'tool_start';
				const needsMargin = !isToolResult;

				if (event.type === 'user_input') {
					content = (
						<Box>
							<Text backgroundColor="#1a1a2e" color="#e0e0e0">
								{' > '}{event.content}{' '}
							</Text>
						</Box>
					);
				} else if (event.type === 'thought') {
					if (event.content.startsWith('Mode:')) return null;
					if (event.hidden) return null;

					const isLast = i === visibleEvents.length - 1;

					// Check if next event is 'done' - append duration inline
					const doneNext = nextEvent?.type === 'done' ? nextEvent : null;
					const durationSuffix = doneNext?.durationMs
						? ` (${(doneNext.durationMs / 1000).toFixed(1)}s)`
						: '';

					content = (
						<Box>
							<Text color="white">{'\u23FA'} </Text>
							<AgentLine content={event.content + durationSuffix} isStreaming={isLast && !doneNext} />
						</Box>
					);
				} else if (event.type === 'tool_start') {
					const argsSummary = summarizeArgs(event.tool, event.args);
					const displayName = formatToolName(event.tool);

					content = (
						<Box>
							<Text color="cyan">{'\u23FA'} </Text>
							<Text color="cyan" bold>{displayName}</Text>
							{argsSummary ? (
								<Text color="cyan" dimColor>({argsSummary})</Text>
							) : null}
						</Box>
					);
				} else if (event.type === 'tool_result') {
					content = (
						<Box paddingLeft={2}>
							<ToolOutput
								tool={event.tool}
								output={event.output}
								isError={event.isError}
							/>
						</Box>
					);
				} else if (event.type === 'done') {
					// Don't render done as a separate line if previous was a thought
					if (prevEvent?.type === 'thought') return null;

					// Edge case: no preceding thought
					const duration = event.durationMs
						? ` (${(event.durationMs / 1000).toFixed(1)}s)`
						: '';
					content = (
						<Box>
							<Text color="green">{'\u23FA'} Done{duration}</Text>
						</Box>
					);
				} else if (event.type === 'error') {
					content = (
						<Box>
							<Text color="red">{'\u23FA'} {event.message}</Text>
						</Box>
					);
				}

				if (!content) return null;

				return (
					<Box key={i} marginTop={needsMargin ? 1 : 0} flexDirection="column">
						{content}
					</Box>
				);
			})}
		</Box>
	);
};

export const MessageList = React.memo(MessageListComponent);
