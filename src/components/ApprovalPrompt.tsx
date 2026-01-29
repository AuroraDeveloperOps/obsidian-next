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

    const handleApproval = useCallback((approved: boolean) => {
        if (resolved) return;
        setResolved(true);

        bus.emitUser({
            type: 'approval_response',
            approved,
            requestId,
        });

        onResolve();
    }, [resolved, requestId, onResolve]);

    useInput((input, key) => {
        if (resolved) return;

        // Y/y or Enter = approve
        if (input.toLowerCase() === 'y' || (key.return && !key.shift)) {
            handleApproval(true);
        }

        // N/n or Escape = deny
        if (input.toLowerCase() === 'n' || key.escape) {
            handleApproval(false);
        }
    });

    if (resolved) {
        return null;
    }

    return (
        <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="yellow"
            paddingX={1}
            paddingY={0}
            marginY={1}
        >
            {/* Header */}
            <Box marginBottom={1}>
                <Text bold color="yellow">[!] Approval Required</Text>
            </Box>

            {/* Context */}
            <Box marginBottom={1}>
                <Text color="white">{context}</Text>
            </Box>

            {/* Diff Preview (if provided) */}
            {diff && (
                <Box
                    flexDirection="column"
                    borderStyle="single"
                    borderColor="gray"
                    paddingX={1}
                    marginBottom={1}
                >
                    <Text color="gray" dimColor>Preview:</Text>
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

            {/* Action Buttons */}
            <Box>
                <Text color="green" bold>[Y]</Text>
                <Text color="white"> Approve  </Text>
                <Text color="red" bold>[N]</Text>
                <Text color="white"> Deny</Text>
            </Box>
        </Box>
    );
};
