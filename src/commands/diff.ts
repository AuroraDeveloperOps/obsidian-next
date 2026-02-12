/**
 * /diff command - View recent file changes with line-level diffs
 *
 * Usage:
 *   /diff              - List recent diffs
 *   /diff <file>       - Show diff for specific file
 *   /diff --clear      - Clear all stored diffs
 */

import { bus } from '../core/bus.js';
import { diffManager, DiffEntry } from '../core/diff.js';
import { CommandHandler } from '../core/commands.js';
import path from 'path';

export const diffCommand: CommandHandler = async (args) => {
	// Handle --clear
	if (args[0] === '--clear' || args[0] === '-c') {
		await diffManager.clearAll();
		bus.emitAgent({
			type: 'done',
			summary: 'All stored diffs cleared.'
		});
		return;
	}

	// Handle specific file
	if (args[0]) {
		const filePath = args.join(' ');
		const diff = await diffManager.getDiffForFile(filePath);

		if (!diff) {
			bus.emitAgent({
				type: 'thought',
				content: `No diff found for: ${filePath}`
			});
			bus.emitAgent({
				type: 'done',
				summary: 'No diff available.'
			});
			return;
		}

		displayDiff(diff);
		return;
	}

	// List recent diffs
	const diffs = await diffManager.listDiffs(10);

	if (diffs.length === 0) {
		bus.emitAgent({
			type: 'thought',
			content: [
				'No diffs stored.',
				'',
				'Diffs are automatically saved when files are modified.'
			].join('\n')
		});
		bus.emitAgent({
			type: 'done',
			summary: 'No diffs available.'
		});
		return;
	}

	const content = [
		'Recent File Changes',
		...diffs.map((diff, i) => {
			const date = new Date(diff.timestamp);
			const dateStr = date.toLocaleDateString();
			const timeStr = date.toLocaleTimeString([], {
				hour: '2-digit',
				minute: '2-digit'
			});
			return [
				`   ⎿  [${i + 1}] ${path.basename(diff.filePath)}`,
				`      ⎿  Path      ${diff.filePath}`,
				`      ⎿  Time      ${dateStr} ${timeStr}`,
				`      ⎿  Changes   +${diff.additions} / -${diff.deletions}`,
				''
			].join('\n');
		}),
		'   [Usage]',
		'   ⎿  /diff <filepath>  View specific diff',
		''
	].join('\n');

	bus.emitAgent({
		type: 'thought',
		content
	});

	bus.emitAgent({
		type: 'done',
		summary: `${diffs.length} diff(s) available.`
	});
};

function displayDiff(diff: DiffEntry): void {
	const date = new Date(diff.timestamp);
	const header = [
		`File Diff: ${path.basename(diff.filePath)}`,
		`   ⎿  Path      ${diff.filePath}`,
		`   ⎿  Time      ${date.toLocaleString()}`,
		`   ⎿  Lines     ${diff.beforeLines} -> ${diff.afterLines}`,
		`   ⎿  Changes   +${diff.additions} / -${diff.deletions}`,
		''
	];

	// Format diff with colors
	const diffLines = diff.diff.split('\n').map((line) => {
		if (line.startsWith('+++') || line.startsWith('---')) {
			return line; // File headers
		} else if (line.startsWith('@@')) {
			return line; // Hunk headers
		} else if (line.startsWith('+')) {
			return line; // Addition - will be colored green by DiffView
		} else if (line.startsWith('-')) {
			return line; // Deletion - will be colored red by DiffView
		}
		return line;
	});

	const output = [...header, ...diffLines, ''];

	bus.emitAgent({
		type: 'thought',
		content: output.join('\n')
	});

	bus.emitAgent({
		type: 'done',
		summary: `Showing diff for ${path.basename(diff.filePath)}`
	});
}
