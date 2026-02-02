import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { bus } from '../core/bus.js';

interface ApprovalPromptProps {
    requestId: string;
    context: string;
    diff?: string;
    onResolve: () => void;
}

/**
 * ApprovalPrompt - Interactive yes/no confirmation for sensitive operations
 *
 * Used for:
 * - Destructive file operations
 * - Dangerous shell commands
 * - External API calls
 */
export const ApprovalPrompt: React.FC<ApprovalPromptProps> = ({
    requestId,
    context,
    diff,
    onResolve,
}) => {
    const [resolved, setResolved] = useState(false);

    const handleApproval = useCallback((approved: boolean, scope: 'session' | 'persistent', bypass: boolean = false) => {
        if (resolved) return;
        setResolved(true);

        bus.emitUser({
            type: 'approval_response',
            approved,
            requestId,
            scope,
            bypass,
        });

        onResolve();
    }, [resolved, requestId, onResolve]);

    useInput((input, key) => {
        if (resolved) return;

        // Y/y or Enter = approve for session
        if (input.toLowerCase() === 'y' || (key.return && !key.shift)) {
            handleApproval(true, 'session');
        }

        // A/a = always approve (persistent)
        if (input.toLowerCase() === 'a') {
            handleApproval(true, 'persistent');
        }

        // S/s = approve and bypass for session
        if (input.toLowerCase() === 's') {
            handleApproval(true, 'session', true);
        }

        // B/b = approve and bypass (persistent)
        if (input.toLowerCase() === 'b') {
            handleApproval(true, 'persistent', true);
        }

        // N/n or Escape = deny for session
        if (input.toLowerCase() === 'n' || key.escape) {
            handleApproval(false, 'session');
        }

        // D/d = always deny (persistent)
        if (input.toLowerCase() === 'd') {
            handleApproval(false, 'persistent');
        }
    });

    if (resolved) {
        return null;
    }

    return (
        <Box
            flexDirection="column"
            paddingX={0}
            marginY={1}
        >
            {/* Context with Alert Icon */}
            <Box marginBottom={0}>
                <Text color="red" bold>[ ! ] </Text>
                <Text color="white" bold>{context}</Text>
            </Box>

            {/* Diff Preview (if provided) */}
            {diff && (
                <Box
                    flexDirection="column"
                    paddingX={0}
                    marginBottom={1}
                    marginTop={1}
                >
                    {diff.split('\n').slice(0, 10).map((line, i) => (
                        <Text
                            key={i}
                            color={
                                line.startsWith('+') ? 'green' :
                                    line.startsWith('-') ? 'red' :
                                        'gray'
                            }
                        >
                            {line}
                        </Text>
                    ))}
                    {diff.split('\n').length > 10 && (
                        <Text color="gray" dimColor>... ({diff.split('\n').length - 10} more lines)</Text>
                    )}
                </Box>
            )}

            {/* Inline Confirmation */}
            <Box marginTop={diff ? 0 : 1}>
                <Text color="gray">      </Text>
                <Text color="red" bold>(y)</Text>
                <Text color="gray"> Yes </Text>
                <Text color="red" bold>(s)</Text>
                <Text color="gray"> Yes (Bypass) </Text>
                <Text color="red" bold>(a)</Text>
                <Text color="gray"> Always </Text>
                <Text color="red" bold>(b)</Text>
                <Text color="gray"> Always (Bypass) </Text>
                <Text color="red" bold>(n)</Text>
                <Text color="gray"> No </Text>
                <Text color="red" bold>(d)</Text>
                <Text color="gray"> Never</Text>
            </Box>
        </Box>
    );
};
