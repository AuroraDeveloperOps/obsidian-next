/**
 * Syntax Highlighting for Code Blocks and Markdown
 */

import chalk from 'chalk';

// Language-specific keyword sets
const KEYWORDS: Record<string, string[]> = {
	typescript: [
		'const',
		'let',
		'var',
		'function',
		'class',
		'interface',
		'type',
		'import',
		'export',
		'from',
		'return',
		'if',
		'else',
		'for',
		'while',
		'switch',
		'case',
		'break',
		'continue',
		'try',
		'catch',
		'throw',
		'async',
		'await',
		'new',
		'this',
		'super',
		'extends',
		'implements',
		'static',
		'public',
		'private',
		'protected',
		'readonly',
		'enum',
		'namespace',
		'module',
		'declare',
		'as',
		'is',
		'in',
		'of',
		'typeof',
		'instanceof',
		'void',
		'null',
		'undefined',
		'true',
		'false'
	],
	javascript: [
		'const',
		'let',
		'var',
		'function',
		'class',
		'import',
		'export',
		'from',
		'return',
		'if',
		'else',
		'for',
		'while',
		'switch',
		'case',
		'break',
		'continue',
		'try',
		'catch',
		'throw',
		'async',
		'await',
		'new',
		'this',
		'super',
		'extends',
		'static',
		'typeof',
		'instanceof',
		'void',
		'null',
		'undefined',
		'true',
		'false'
	],
	python: [
		'def',
		'class',
		'import',
		'from',
		'return',
		'if',
		'elif',
		'else',
		'for',
		'while',
		'try',
		'except',
		'finally',
		'with',
		'as',
		'pass',
		'break',
		'continue',
		'raise',
		'yield',
		'lambda',
		'and',
		'or',
		'not',
		'in',
		'is',
		'None',
		'True',
		'False',
		'self',
		'async',
		'await'
	],
	bash: [
		'if',
		'then',
		'else',
		'elif',
		'fi',
		'for',
		'while',
		'do',
		'done',
		'case',
		'esac',
		'function',
		'return',
		'exit',
		'export',
		'local',
		'readonly',
		'declare',
		'echo',
		'cd',
		'ls',
		'rm',
		'cp',
		'mv',
		'mkdir',
		'cat',
		'grep',
		'sed',
		'awk',
		'npm',
		'npx',
		'node',
		'git'
	],
	json: [],
	default: [
		'const',
		'let',
		'var',
		'function',
		'class',
		'return',
		'if',
		'else',
		'for',
		'while',
		'import',
		'export',
		'true',
		'false',
		'null'
	]
};

// Built-in types
const TYPES = [
	'string',
	'number',
	'boolean',
	'object',
	'any',
	'void',
	'never',
	'unknown',
	'Array',
	'Promise',
	'Map',
	'Set',
	'Record',
	'Partial',
	'Required',
	'Readonly'
];

/**
 * Highlight a single line of code
 */
function highlightCodeLine(line: string, lang: string): string {
	const keywords = KEYWORDS[lang] || KEYWORDS.default;

	// Don't process empty lines
	if (!line.trim()) return line;

	let result = line;

	// Comments (// or #)
	const commentMatch = result.match(/(\/\/.*|#.*)$/);
	if (commentMatch) {
		const commentStart = result.indexOf(commentMatch[0]);
		const before = result.slice(0, commentStart);
		const comment = chalk.gray(commentMatch[0]);
		result = before + comment;
		// Process the part before the comment
		line = before;
	}

	// Strings (single and double quotes)
	result = result.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, (match) => {
		return chalk.green(match);
	});

	// Numbers
	result = result.replace(/\b(\d+\.?\d*)\b/g, (match) => {
		return chalk.yellow(match);
	});

	// Keywords
	for (const kw of keywords) {
		const regex = new RegExp(`\\b(${kw})\\b`, 'g');
		result = result.replace(regex, chalk.magenta('$1'));
	}

	// Types (for TypeScript)
	if (lang === 'typescript' || lang === 'ts') {
		for (const type of TYPES) {
			const regex = new RegExp(`\\b(${type})\\b`, 'g');
			result = result.replace(regex, chalk.cyan('$1'));
		}
	}

	// Function calls
	result = result.replace(/\b([a-zA-Z_]\w*)\s*\(/g, (match, fn) => {
		return chalk.blue(fn) + '(';
	});

	return result;
}

/**
 * Highlight a code block
 */
export function highlightCodeBlock(
	code: string,
	lang: string = 'default'
): string {
	const normalizedLang = lang
		.toLowerCase()
		.replace('shell', 'bash')
		.replace('sh', 'bash')
		.replace('ts', 'typescript')
		.replace('js', 'javascript')
		.replace('py', 'python');

	const lines = code.split('\n');
	return lines
		.map((line) => highlightCodeLine(line, normalizedLang))
		.join('\n');
}

/**
 * Parse markdown content and return segments for rendering
 */
export interface ContentSegment {
	type:
		| 'text'
		| 'code'
		| 'inline-code'
		| 'heading'
		| 'list'
		| 'bold'
		| 'italic';
	content: string;
	lang?: string;
}

export function parseMarkdown(content: string): ContentSegment[] {
	const segments: ContentSegment[] = [];
	const lines = content.split('\n');

	let inCodeBlock = false;
	let codeBlockLang = '';
	let codeBlockContent: string[] = [];

	for (const line of lines) {
		// Code block start/end
		if (line.startsWith('```')) {
			if (inCodeBlock) {
				// End of code block
				segments.push({
					type: 'code',
					content: codeBlockContent.join('\n'),
					lang: codeBlockLang
				});
				codeBlockContent = [];
				inCodeBlock = false;
				codeBlockLang = '';
			} else {
				// Start of code block
				inCodeBlock = true;
				codeBlockLang = line.slice(3).trim() || 'default';
			}
			continue;
		}

		if (inCodeBlock) {
			codeBlockContent.push(line);
			continue;
		}

		// Headings
		if (line.startsWith('#')) {
			segments.push({ type: 'heading', content: line });
			continue;
		}

		// List items
		if (line.match(/^\s*[-*]\s/) || line.match(/^\s*\d+\.\s/)) {
			segments.push({ type: 'list', content: line });
			continue;
		}

		// Regular text (may contain inline code)
		segments.push({ type: 'text', content: line });
	}

	// Handle unclosed code block
	if (inCodeBlock && codeBlockContent.length > 0) {
		segments.push({
			type: 'code',
			content: codeBlockContent.join('\n'),
			lang: codeBlockLang
		});
	}

	return segments;
}

/**
 * Render markdown content with syntax highlighting (returns chalk-colored string)
 */
export function renderMarkdown(content: string): string {
	const segments = parseMarkdown(content);
	const output: string[] = [];

	for (const seg of segments) {
		switch (seg.type) {
			case 'code':
				// Code block with background
				output.push(chalk.bgGray.black(' ' + (seg.lang || 'code') + ' '));
				const highlighted = highlightCodeBlock(seg.content, seg.lang);
				// Background color for the code block content
				const bgCode = chalk.bgHex('#151515');
				for (const line of highlighted.split('\n')) {
					// We need to apply the background to the whole line including padding
					// Since highlight returns ansi codes, we wrap it
					output.push(bgCode('  ' + line + '  '));
				}
				break;

			case 'heading':
				const level = (seg.content.match(/^#+/) || [''])[0].length;
				const text = seg.content.replace(/^#+\s*/, '');
				if (level === 1) {
					output.push(chalk.bold.white(text));
				} else if (level === 2) {
					output.push(chalk.bold.cyan(text));
				} else {
					output.push(chalk.bold.gray(text));
				}
				break;

			case 'list':
				// Color the bullet/number
				const listText = seg.content.replace(
					/^(\s*)([-*]|\d+\.)\s/,
					(_, indent, bullet) => {
						return indent + chalk.cyan(bullet) + ' ';
					}
				);
				output.push(listText);
				break;

			case 'text':
				// Handle inline code
				let line = seg.content;
				line = line.replace(/`([^`]+)`/g, (_, code) => {
					return chalk.bgGray.white(' ' + code + ' ');
				});
				// Handle bold
				line = line.replace(/\*\*([^*]+)\*\*/g, (_, text) => {
					return chalk.bold(text);
				});
				// Handle italic
				line = line.replace(/\*([^*]+)\*/g, (_, text) => {
					return chalk.italic(text);
				});
				output.push(line);
				break;

			default:
				output.push(seg.content);
		}
	}

	return output.join('\n');
}
