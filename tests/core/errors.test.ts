/**
 * Error Handling Tests
 *
 * Tests for the structured error system
 */

import { describe, it, expect } from 'vitest';
import {
    ObsidianError,
    SecurityError,
    ContextError,
    ToolExecutionError,
    DatabaseError,
    ConfigurationError,
    LLMError,
    SessionError,
    MCPError,
    TimeoutError,
    isObsidianError,
    wrapError,
    safeHandle,
    safeHandleAsync,
    ErrorCodes,
} from '../../src/core/errors.js';

describe('Error Classes', () => {
    describe('ObsidianError', () => {
        it('should create error with all properties', () => {
            const error = new ObsidianError('Test error', 'TEST001', true, true);

            expect(error.message).toBe('Test error');
            expect(error.code).toBe('TEST001');
            expect(error.recoverable).toBe(true);
            expect(error.userFacing).toBe(true);
            expect(error.name).toBe('ObsidianError');
        });

        it('should convert to user message', () => {
            const userFacing = new ObsidianError('User message', 'E001', true, true);
            expect(userFacing.toUserMessage()).toBe('User message');

            const internal = new ObsidianError('Internal details', 'E002', true, false);
            expect(internal.toUserMessage()).toBe('An internal error occurred');
        });

        it('should convert to JSON', () => {
            const error = new ObsidianError('Test', 'T001');
            const json = error.toJSON();

            expect(json.name).toBe('ObsidianError');
            expect(json.code).toBe('T001');
            expect(json.message).toBe('Test');
            expect(json.recoverable).toBe(true);
        });

        it('should be instanceof Error', () => {
            const error = new ObsidianError('Test', 'T001');
            expect(error instanceof Error).toBe(true);
            expect(error instanceof ObsidianError).toBe(true);
        });
    });

    describe('SecurityError', () => {
        it('should have correct defaults', () => {
            const error = new SecurityError('Security violation');

            expect(error.code).toBe('SECURITY_ERROR');
            expect(error.blocked).toBe(true);
            expect(error.riskLevel).toBe('high');
            expect(error.recoverable).toBe(false);
        });

        it('should allow custom risk level', () => {
            const error = new SecurityError('Low risk issue', false, 'low');

            expect(error.blocked).toBe(false);
            expect(error.riskLevel).toBe('low');
        });
    });

    describe('ContextError', () => {
        it('should have correct code', () => {
            const error = new ContextError('Context overflow');

            expect(error.code).toBe('CONTEXT_ERROR');
            expect(error.recoverable).toBe(true);
        });
    });

    describe('ToolExecutionError', () => {
        it('should include tool name', () => {
            const error = new ToolExecutionError('Failed to execute', 'bash', { command: 'ls' });

            expect(error.toolName).toBe('bash');
            expect(error.args).toEqual({ command: 'ls' });
        });

        it('should include args in JSON', () => {
            const error = new ToolExecutionError('Failed', 'read', { path: '/file' });
            const json = error.toJSON();

            expect(json.toolName).toBe('read');
            expect(json.args).toEqual({ path: '/file' });
        });
    });

    describe('DatabaseError', () => {
        it('should include operation type', () => {
            const error = new DatabaseError('Query failed', 'read');

            expect(error.operation).toBe('read');
            expect(error.code).toBe('DATABASE_ERROR');
        });
    });

    describe('ConfigurationError', () => {
        it('should include config key', () => {
            const error = new ConfigurationError('Missing API key', 'apiKey');

            expect(error.configKey).toBe('apiKey');
        });
    });

    describe('LLMError', () => {
        it('should include status code and retryable flag', () => {
            const error = new LLMError('Rate limited', 429, true);

            expect(error.statusCode).toBe(429);
            expect(error.retryable).toBe(true);
            expect(error.recoverable).toBe(true);
        });

        it('should default to non-retryable', () => {
            const error = new LLMError('Unknown error');

            expect(error.retryable).toBe(false);
        });
    });

    describe('SessionError', () => {
        it('should include session ID', () => {
            const error = new SessionError('Session not found', 'sess_123');

            expect(error.sessionId).toBe('sess_123');
        });
    });

    describe('MCPError', () => {
        it('should include server name', () => {
            const error = new MCPError('Connection failed', 'filesystem');

            expect(error.serverName).toBe('filesystem');
        });
    });

    describe('TimeoutError', () => {
        it('should include timeout duration', () => {
            const error = new TimeoutError('Request timed out', 30000);

            expect(error.timeoutMs).toBe(30000);
        });
    });
});

describe('Error Utilities', () => {
    describe('isObsidianError', () => {
        it('should return true for ObsidianError instances', () => {
            expect(isObsidianError(new ObsidianError('Test', 'T001'))).toBe(true);
            expect(isObsidianError(new SecurityError('Test'))).toBe(true);
            expect(isObsidianError(new ToolExecutionError('Test', 'bash'))).toBe(true);
        });

        it('should return false for regular errors', () => {
            expect(isObsidianError(new Error('Test'))).toBe(false);
            expect(isObsidianError(new TypeError('Test'))).toBe(false);
        });

        it('should return false for non-errors', () => {
            expect(isObsidianError('string error')).toBe(false);
            expect(isObsidianError(null)).toBe(false);
            expect(isObsidianError(undefined)).toBe(false);
            expect(isObsidianError({ message: 'fake' })).toBe(false);
        });
    });

    describe('wrapError', () => {
        it('should return ObsidianError unchanged', () => {
            const original = new SecurityError('Test');
            const wrapped = wrapError(original);

            expect(wrapped).toBe(original);
        });

        it('should wrap regular Error', () => {
            const original = new Error('Test error');
            const wrapped = wrapError(original);

            expect(wrapped instanceof ObsidianError).toBe(true);
            expect(wrapped.message).toBe('Test error');
        });

        it('should wrap string', () => {
            const wrapped = wrapError('string error');

            expect(wrapped instanceof ObsidianError).toBe(true);
            expect(wrapped.message).toBe('string error');
        });

        it('should use custom default code', () => {
            const wrapped = wrapError(new Error('Test'), 'CUSTOM_CODE');

            expect(wrapped.code).toBe('CUSTOM_CODE');
        });
    });

    describe('safeHandle', () => {
        it('should return function result on success', () => {
            const result = safeHandle(() => 'success', 'fallback');
            expect(result).toBe('success');
        });

        it('should return fallback on error', () => {
            const result = safeHandle(() => {
                throw new Error('Test');
            }, 'fallback');
            expect(result).toBe('fallback');
        });

        it('should call onError callback', () => {
            let capturedError: ObsidianError | null = null;

            safeHandle(
                () => { throw new Error('Test'); },
                'fallback',
                (err) => { capturedError = err; }
            );

            expect(capturedError).not.toBeNull();
            expect(capturedError!.message).toBe('Test');
        });
    });

    describe('safeHandleAsync', () => {
        it('should return async function result on success', async () => {
            const result = await safeHandleAsync(async () => 'success', 'fallback');
            expect(result).toBe('success');
        });

        it('should return fallback on async error', async () => {
            const result = await safeHandleAsync(async () => {
                throw new Error('Test');
            }, 'fallback');
            expect(result).toBe('fallback');
        });

        it('should call onError callback for async errors', async () => {
            let capturedError: ObsidianError | null = null;

            await safeHandleAsync(
                async () => { throw new Error('Async test'); },
                'fallback',
                (err) => { capturedError = err; }
            );

            expect(capturedError).not.toBeNull();
            expect(capturedError!.message).toBe('Async test');
        });
    });
});

describe('ErrorCodes', () => {
    it('should have security error codes', () => {
        expect(ErrorCodes.BLOCKED_COMMAND).toBe('SEC001');
        expect(ErrorCodes.PATH_TRAVERSAL).toBe('SEC002');
        expect(ErrorCodes.SENSITIVE_FILE).toBe('SEC003');
    });

    it('should have context error codes', () => {
        expect(ErrorCodes.CONTEXT_OVERFLOW).toBe('CTX001');
        expect(ErrorCodes.WORKING_SET_FULL).toBe('CTX002');
    });

    it('should have tool error codes', () => {
        expect(ErrorCodes.TOOL_NOT_FOUND).toBe('TOOL001');
        expect(ErrorCodes.TOOL_EXECUTION_FAILED).toBe('TOOL002');
    });

    it('should have LLM error codes', () => {
        expect(ErrorCodes.LLM_RATE_LIMITED).toBe('LLM001');
        expect(ErrorCodes.LLM_CONTEXT_TOO_LONG).toBe('LLM002');
    });
});
