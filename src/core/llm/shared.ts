/**
 * Shared types and constants for LLM module
 */

export const MAX_TOOL_ITERATIONS = 67;

export const CONTEXT = {
	MAX_MESSAGES: 40,
	KEEP_FIRST: 2,
	KEEP_LAST: 15,
	BUFFER: 5,
	TOKEN_LIMIT_WARN: 0.8,
	TOKEN_LIMIT_PRUNE: 0.9,
	TOKEN_LIMIT_STOP: 0.98,
	MAX_TOKENS_TOTAL: 200_000
};

export interface ComputerUseState {
	enabled: boolean;
	displayWidth: number;
	displayHeight: number;
	scale: number;
	scaledWidth: number;
	scaledHeight: number;
}

export interface ToolUsePartial {
	id: string;
	name: string;
	input: string | Record<string, unknown>;
}

export type ContentBlock = { type: string; [key: string]: unknown };

export const MODEL_MAP: Record<string, string> = {
	'claude-opus-4-6': 'claude-opus-4-6-20260207',
	'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
	'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
	'claude-opus-4-5': 'claude-opus-4-5-20251101',
	ollama: 'llama3'
};
