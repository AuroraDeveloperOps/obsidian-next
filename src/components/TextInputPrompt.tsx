import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { bus } from '../core/bus.js';

interface TextInputPromptProps {
    requestId: string;
    prompt: string;
    masked?: boolean;
    placeholder?: string;
    onResolve: () => void;
}

/**
 * TextInputPrompt - Interactive text input for sensitive data
 *
 * Used for:
 * - API key entry
 * - Password input
 * - Custom configuration values
 */
export const TextInputPrompt: React.FC<TextInputPromptProps> = ({
    requestId,
    prompt,
    masked = false,
    placeholder = '',
    onResolve,
}) => {
    const [value, setValue] = useState('');
    const [resolved, setResolved] = useState(false);

    const handleSubmit = useCallback(() => {
        if (resolved) return;

        setResolved(true);

        bus.emitUser({
            type: 'text_input_response',
            requestId,
            value,
        });

        onResolve();
    }, [resolved, requestId, value, onResolve]);

    const handleCancel = useCallback(() => {
        if (resolved) return;

        setResolved(true);

        bus.emitUser({
            type: 'text_input_response',
            requestId,
            value: '',
            cancelled: true,
        });

        onResolve();
    }, [resolved, requestId, onResolve]);

    useInput((input, key) => {
        if (resolved) return;

        // Enter to submit
        if (key.return) {
            handleSubmit();
            return;
        }

        // Escape to cancel
        if (key.escape) {
            handleCancel();
            return;
        }

        // Backspace to delete
        if (key.backspace || key.delete) {
            setValue(prev => prev.slice(0, -1));
            return;
        }

        // Ignore control keys
        if (key.ctrl || key.meta) {
            return;
        }

        // Add printable characters (including paste)
        if (input) {
            setValue(prev => prev + input);
        }
    });

    if (resolved) {
        return null;
    }

    // Display value (masked or plain)
    const displayValue = masked
        ? '*'.repeat(value.length)
        : value;

    const showPlaceholder = value.length === 0 && placeholder;

    return (
        <Box
            flexDirection="column"
            paddingX={0}
            marginY={1}
        >
            {/* Prompt */}
            <Box marginBottom={0}>
                <Text bold color="white">[ Input ] {prompt}</Text>
            </Box>

            {/* Input field */}
            <Box marginBottom={0}>
                <Text color={value.length > 0 ? 'white' : 'gray'}>
                    &gt; {showPlaceholder ? placeholder : displayValue}
                </Text>
                <Text color="red" bold>_</Text>
            </Box>

            {/* Instructions */}
            <Box>
                <Text color="gray" dimColor>
                    Enter to submit, Esc to cancel {masked && '(Hidden)'}
                </Text>
            </Box>
        </Box>
    );
};
