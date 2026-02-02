/**
 * Structured Error Types for Obsidian Next
 *
 * Provides consistent error handling across the codebase
 * with proper categorization and recovery hints.
 */

/**
 * Base error class for all Obsidian errors
 */
export class ObsidianError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly recoverable: boolean = true,
        public readonly userFacing: boolean = true
    ) {
        super(message);
        this.name = 'ObsidianError';
        // Maintains proper stack trace for where error was thrown
        Error.captureStackTrace?.(this, this.constructor);
    }

    /**
     * Convert to a user-friendly message
     */
    toUserMessage(): string {
        return this.userFacing ? this.message : 'An internal error occurred';
    }

    /**
     * Convert to JSON for logging
     */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            recoverable: this.recoverable,
            stack: this.stack,
        };
    }
}

/**
 * Security-related errors (blocked commands, path traversal, etc.)
 */
export class SecurityError extends ObsidianError {
    constructor(
        message: string,
        public readonly blocked: boolean = true,
        public readonly riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'high'
    ) {
        super(message, 'SECURITY_ERROR', false, true);
        this.name = 'SecurityError';
    }
}

/**
 * Context management errors (working set, history, etc.)
 */
export class ContextError extends ObsidianError {
    constructor(message: string) {
        super(message, 'CONTEXT_ERROR', true, true);
        this.name = 'ContextError';
    }
}

/**
 * Tool execution errors
 */
export class ToolExecutionError extends ObsidianError {
    constructor(
        message: string,
        public readonly toolName: string,
        public readonly args?: Record<string, unknown>
    ) {
        super(message, 'TOOL_ERROR', true, true);
        this.name = 'ToolExecutionError';
    }

    toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            toolName: this.toolName,
            args: this.args,
        };
    }
}

/**
 * Database errors
 */
export class DatabaseError extends ObsidianError {
    constructor(
        message: string,
        public readonly operation: 'read' | 'write' | 'delete' | 'init'
    ) {
        super(message, 'DATABASE_ERROR', true, false);
        this.name = 'DatabaseError';
    }
}

/**
 * Configuration errors (missing API key, invalid settings, etc.)
 */
export class ConfigurationError extends ObsidianError {
    constructor(
        message: string,
        public readonly configKey?: string
    ) {
        super(message, 'CONFIG_ERROR', true, true);
        this.name = 'ConfigurationError';
    }
}

/**
 * LLM/API errors
 */
export class LLMError extends ObsidianError {
    constructor(
        message: string,
        public readonly statusCode?: number,
        public readonly retryable: boolean = false
    ) {
        super(message, 'LLM_ERROR', retryable, true);
        this.name = 'LLMError';
    }
}

/**
 * Session management errors
 */
export class SessionError extends ObsidianError {
    constructor(
        message: string,
        public readonly sessionId?: string
    ) {
        super(message, 'SESSION_ERROR', true, true);
        this.name = 'SessionError';
    }
}

/**
 * MCP (Model Context Protocol) errors
 */
export class MCPError extends ObsidianError {
    constructor(
        message: string,
        public readonly serverName?: string
    ) {
        super(message, 'MCP_ERROR', true, true);
        this.name = 'MCPError';
    }
}

/**
 * Timeout errors
 */
export class TimeoutError extends ObsidianError {
    constructor(
        message: string,
        public readonly timeoutMs: number
    ) {
        super(message, 'TIMEOUT_ERROR', true, true);
        this.name = 'TimeoutError';
    }
}

/**
 * Error codes for programmatic handling
 */
export const ErrorCodes = {
    // Security
    BLOCKED_COMMAND: 'SEC001',
    PATH_TRAVERSAL: 'SEC002',
    SENSITIVE_FILE: 'SEC003',
    APPROVAL_DENIED: 'SEC004',
    APPROVAL_TIMEOUT: 'SEC005',

    // Context
    CONTEXT_OVERFLOW: 'CTX001',
    WORKING_SET_FULL: 'CTX002',
    HISTORY_CORRUPT: 'CTX003',

    // Tools
    TOOL_NOT_FOUND: 'TOOL001',
    TOOL_EXECUTION_FAILED: 'TOOL002',
    TOOL_INVALID_ARGS: 'TOOL003',

    // Database
    DB_INIT_FAILED: 'DB001',
    DB_QUERY_FAILED: 'DB002',
    DB_MIGRATION_FAILED: 'DB003',

    // LLM
    LLM_RATE_LIMITED: 'LLM001',
    LLM_CONTEXT_TOO_LONG: 'LLM002',
    LLM_INVALID_RESPONSE: 'LLM003',
    LLM_API_ERROR: 'LLM004',

    // Session
    SESSION_NOT_FOUND: 'SES001',
    SESSION_CORRUPT: 'SES002',
    SESSION_RESTORE_FAILED: 'SES003',

    // MCP
    MCP_CONNECTION_FAILED: 'MCP001',
    MCP_TOOL_ERROR: 'MCP002',
    MCP_SERVER_NOT_FOUND: 'MCP003',
} as const;

/**
 * Type guard to check if an error is an ObsidianError
 */
export function isObsidianError(error: unknown): error is ObsidianError {
    return error instanceof ObsidianError;
}

/**
 * Wrap unknown errors into ObsidianError
 */
export function wrapError(error: unknown, defaultCode: string = 'UNKNOWN'): ObsidianError {
    if (isObsidianError(error)) {
        return error;
    }

    if (error instanceof Error) {
        return new ObsidianError(error.message, defaultCode, true, true);
    }

    return new ObsidianError(String(error), defaultCode, true, true);
}

/**
 * Safe error handler that never throws
 */
export function safeHandle<T>(
    fn: () => T,
    fallback: T,
    onError?: (error: ObsidianError) => void
): T {
    try {
        return fn();
    } catch (error) {
        const wrapped = wrapError(error);
        onError?.(wrapped);
        return fallback;
    }
}

/**
 * Async version of safeHandle
 */
export async function safeHandleAsync<T>(
    fn: () => Promise<T>,
    fallback: T,
    onError?: (error: ObsidianError) => void
): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        const wrapped = wrapError(error);
        onError?.(wrapped);
        return fallback;
    }
}
