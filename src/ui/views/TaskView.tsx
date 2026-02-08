import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { tasks, Task } from '../../core/tasks.js';

interface TaskViewProps {
    onClose: () => void;
}

// Checkbox icons
const CHECKBOX = {
    empty: '☐',
    checked: '☑',
    inProgress: '◐',
} as const;

/**
 * Render a progress bar
 */
const ProgressBar: React.FC<{ done: number; total: number; width?: number }> = ({
    done,
    total,
    width = 20
}) => {
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    const filled = Math.round((done / total) * width) || 0;
    const empty = width - filled;

    return (
        <Text>
            <Text color="green">{'█'.repeat(filled)}</Text>
            <Text color="gray">{'░'.repeat(empty)}</Text>
            <Text dimColor> {percent}%</Text>
            <Text color="gray"> {done} of {total} done</Text>
        </Text>
    );
};

export const TaskView: React.FC<TaskViewProps> = ({ onClose }) => {
    const [task, setTask] = useState<Task | null>(tasks.get());
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        // Refresh on mount
        tasks.init().then(() => {
            setTask(tasks.get());
        });
    }, []);

    const subtasks = task?.subtasks || [];
    const doneCount = subtasks.filter(t => t.done).length;
    const totalCount = subtasks.length;

    // Keyboard navigation
    useInput((input, key) => {
        if (key.escape) {
            onClose();
            return;
        }

        if (!task || subtasks.length === 0) return;

        // j/k or arrow navigation
        if (input === 'j' || key.downArrow) {
            setSelectedIndex(prev => Math.min(prev + 1, subtasks.length - 1));
        } else if (input === 'k' || key.upArrow) {
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (input === 'x' || key.return) {
            // Toggle selected task (mark done via API)
            if (!subtasks[selectedIndex].done) {
                tasks.completeSubtask(selectedIndex).then(() => {
                    setTask(tasks.get());
                });
            }
        }
    });

    return (
        <Box flexDirection="column" width="100%" height="100%" paddingX={1} paddingY={0}>
            {/* Header */}
            <Box marginBottom={1}>
                <Text bold color="white">[ Current Task ]</Text>
            </Box>

            {!task ? (
                <Box flexDirection="column" alignItems="center" justifyContent="center" height={5}>
                    <Text color="gray">No active task.</Text>
                    <Text dimColor>Start a new task by describing it in the chat.</Text>
                </Box>
            ) : (
                <Box flexDirection="column" flexGrow={1}>
                    {/* Title */}
                    <Box marginBottom={1}>
                        <Text bold color="red">{task.title}</Text>
                    </Box>

                    {/* Progress Bar */}
                    <Box marginBottom={1}>
                        <ProgressBar done={doneCount} total={totalCount} />
                    </Box>

                    {/* Status Badge */}
                    <Box marginBottom={1}>
                        <Text color="gray">Status: </Text>
                        <Text color={
                            task.status === 'done' ? 'green' :
                                task.status === 'in_progress' ? 'yellow' :
                                    task.status === 'blocked' ? 'red' : 'blue'
                        }>
                            {task.status.toUpperCase().replace('_', ' ')}
                        </Text>
                    </Box>

                    {/* Divider */}
                    <Box marginBottom={1}>
                        <Text color="gray">{'─'.repeat(40)}</Text>
                    </Box>

                    {/* Subtasks with selection */}
                    <Box flexDirection="column" marginBottom={1}>
                        {subtasks.map((st, i) => {
                            const isSelected = i === selectedIndex;
                            const icon = st.done ? CHECKBOX.checked : CHECKBOX.empty;
                            const textColor = st.done ? 'green' : isSelected ? 'cyan' : 'white';

                            return (
                                <Box key={i} marginLeft={0}>
                                    <Text color={isSelected ? 'cyan' : 'gray'}>
                                        {isSelected ? '▸ ' : '  '}
                                    </Text>
                                    <Text color={st.done ? 'green' : 'gray'}>
                                        {icon}{' '}
                                    </Text>
                                    <Text color={textColor} strikethrough={st.done}>
                                        {st.text}
                                    </Text>
                                </Box>
                            );
                        })}
                    </Box>

                    {/* Context - Tree Style */}
                    {task.context.length > 0 && (
                        <Box flexDirection="column" marginTop={1}>
                            <Text color="gray" bold>Context</Text>
                            {task.context.slice(0, 10).map((ctx, i, arr) => {
                                const isLast = i === arr.length - 1;
                                return (
                                    <Box key={i} flexDirection="column">
                                        <Box flexDirection="row">
                                            <Text color="gray">{isLast ? ' └─ ' : ' ├─ '}</Text>
                                            <Text dimColor>{ctx}</Text>
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    )}
                </Box>
            )}

            {/* Footer with keybindings */}
            <Box marginTop={1}>
                <Text color="gray" dimColor>
                    j/k: navigate  x: toggle  Esc: close
                </Text>
            </Box>
        </Box>
    );
};
