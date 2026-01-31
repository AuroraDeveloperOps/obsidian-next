import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { bus } from '../core/bus.js';
import { Option } from '../events/types.js';

interface ChoicePromptProps {
    question: string;
    options: Option[];
    onResolve: () => void;
}

/**
 * ChoicePrompt - Interactive multi-option selection
 *
 * Used for:
 * - Model selection
 * - Configuration choices
 * - Branching decisions in tool execution
 */
export const ChoicePrompt: React.FC<ChoicePromptProps> = ({
    question,
    options,
    onResolve,
}) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [resolved, setResolved] = useState(false);

    const handleSelect = useCallback(() => {
        if (resolved) return;

        const selected = options[selectedIndex];
        if (!selected) return;

        setResolved(true);

        bus.emitUser({
            type: 'user_choice',
            selectionId: selected.id,
        });

        onResolve();
    }, [resolved, selectedIndex, options, onResolve]);

    useInput((input, key) => {
        if (resolved) return;

        // Arrow navigation
        if (key.upArrow) {
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : options.length - 1));
        }

        if (key.downArrow) {
            setSelectedIndex(prev => (prev < options.length - 1 ? prev + 1 : 0));
        }

        // Number keys for quick selection (1-9)
        const num = parseInt(input, 10);
        if (num >= 1 && num <= options.length) {
            setSelectedIndex(num - 1);
        }

        // Enter to confirm
        if (key.return) {
            handleSelect();
        }

        // Escape to cancel (select first option or emit cancel)
        if (key.escape) {
            setResolved(true);
            bus.emitUser({
                type: 'user_choice',
                selectionId: 'cancel',
            });
            onResolve();
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
            {/* Question */}
            <Box marginBottom={1}>
                <Text bold color="white">[ ? ] {question}</Text>
            </Box>

            {/* Options */}
            <Box flexDirection="column" marginBottom={1}>
                {options.map((option, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                        <Box key={option.id}>
                            <Text color={isSelected ? 'red' : 'gray'}>
                                {isSelected ? '> ' : '  '}
                            </Text>
                            <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>
                                {option.label}
                            </Text>
                        </Box>
                    );
                })}
            </Box>

            {/* Instructions */}
            <Box>
                <Text color="gray" dimColor>
                    Use arrows to select, Enter to confirm
                </Text>
            </Box>
        </Box>
    );
};
