import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { tasks, Task } from '../../core/tasks.js';

interface TaskViewProps {
    onClose: () => void;
}

export const TaskView: React.FC<TaskViewProps> = ({ onClose }) => {
    const [task, setTask] = useState<Task | null>(tasks.get());

    useEffect(() => {
        // Refresh on mount
        tasks.init().then(() => {
            setTask(tasks.get());
        });
    }, []);

    useInput((_, key) => {
        if (key.escape) {
            onClose();
        }
    });

    return (
        <Box flexDirection="column" width="100%" height="100%" paddingX={1} paddingY={0}>
            {/* Minimal Header */}
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
                    {/* Header */}
                    <Box marginBottom={1}>
                        <Text bold color="red">{task.title}</Text>
                    </Box>
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

                    {/* Progress - Checklist Style */}
                    <Box flexDirection="column" marginBottom={1}>
                        <Text color="gray" bold>
                            Tasks ({task.subtasks.filter(t => t.done).length} done, {task.subtasks.filter(t => !t.done).length} open)
                        </Text>
                        {task.subtasks.map((st, i) => (
                            <Box key={i} marginLeft={0}>
                                <Text color={st.done ? 'green' : 'white'}>
                                    {st.done ? '  ✔ ' : '  ◻ '} {st.text}
                                </Text>
                            </Box>
                        ))}
                    </Box>

                    {/* Context - Tree Style */}
                    {task.context.length > 0 && (
                        <Box flexDirection="column" marginTop={1}>
                            <Text color="gray" bold>Context</Text>
                            {task.context.slice(0, 15).map((ctx, i, arr) => {
                                const isLast = i === arr.length - 1;
                                return (
                                    <Box key={i} flexDirection="column">
                                        {/* Main Line */}
                                        <Box flexDirection="row">
                                            <Text color="gray">{isLast ? ' └─ ● ' : ' ├─ ● '}</Text>
                                            <Text dimColor>{ctx}</Text>
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    )}
                </Box>
            )}

            {/* Minimal Footer */}
            <Box marginTop={1}>
                <Text color="gray" dimColor>Esc to close</Text>
            </Box>
        </Box>
    );
};
