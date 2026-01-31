import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { session, SessionInfo } from '../../core/session.js';
import { highlightJson } from '../../utils/highlight.js';

interface SessionViewProps {
    onClose: () => void;
    onResume: (sessionId: string) => void;
}

export const SessionView: React.FC<SessionViewProps> = ({ onClose, onResume }) => {
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Track detailed view of selected session
    const [showDetail, setShowDetail] = useState(false);

    useEffect(() => {
        loadSessions();
    }, []);

    const loadSessions = async () => {
        setLoading(true);
        try {
            const list = await session.list();
            setSessions(list);
            // If list is empty, we handle that in render
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        await session.delete(id);
        // Refresh list, keeping selection index in bounds
        const newList = await session.list();
        setSessions(newList);
        if (selectedIndex >= newList.length) {
            setSelectedIndex(Math.max(0, newList.length - 1));
        }
    };

    useInput((input, key) => {
        if (key.escape) {
            onClose();
            return;
        }

        if (sessions.length === 0) return;

        if (key.upArrow) {
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : sessions.length - 1));
        }

        if (key.downArrow) {
            setSelectedIndex(prev => (prev < sessions.length - 1 ? prev + 1 : 0));
        }

        if (key.return) {
            // Resume session
            const selected = sessions[selectedIndex];
            if (selected) {
                onResume(selected.id);
            }
        }

        if (key.delete || key.backspace || (input === 'd' && !key.ctrl)) {
            // Delete session
            const selected = sessions[selectedIndex];
            if (selected) {
                handleDelete(selected.id);
            }
        }
    });

    if (loading) {
        return <Text color="gray">Loading sessions...</Text>;
    }

    if (error) {
        return <Text color="red">Error: {error}</Text>;
    }

    if (sessions.length === 0) {
        return (
            <Box flexDirection="column" padding={1} borderStyle="round" borderColor="gray">
                <Text color="yellow">No saved sessions found.</Text>
                <Text color="gray">Sessions are created automatically when you exit.</Text>
                <Box marginTop={1}>
                    <Text>Press <Text bold>Esc</Text> to return.</Text>
                </Box>
            </Box>
        );
    }

    // Render list
    // Limit to 10 visible items for scrolling
    const VISIBLE_ITEMS = 10;
    const startIdx = Math.max(0, Math.min(selectedIndex - Math.floor(VISIBLE_ITEMS / 2), sessions.length - VISIBLE_ITEMS));
    const endIdx = Math.min(startIdx + VISIBLE_ITEMS, sessions.length);
    const visibleSessions = sessions.slice(startIdx, endIdx);

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
            <Box marginBottom={1} borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderBottom={true} borderColor="gray">
                <Text bold color="cyan">Saved Sessions</Text>
            </Box>

            {/* Header Row */}
            <Box flexDirection="row" marginBottom={1}>
                <Box width={20}><Text color="gray" bold>ID</Text></Box>
                <Box width={25}><Text color="gray" bold>Date</Text></Box>
                <Box width={40}><Text color="gray" bold>Task</Text></Box>
                <Box width={10}><Text color="gray" bold>Files</Text></Box>
            </Box>

            {visibleSessions.map((sess, idx) => {
                const realIndex = startIdx + idx;
                const isSelected = realIndex === selectedIndex;
                const dateStr = new Date(sess.savedAt).toLocaleString();

                return (
                    <Box key={sess.id} flexDirection="row">
                        <Box width={20}>
                            <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                                {isSelected ? '> ' : '  '}
                                {sess.id}
                            </Text>
                        </Box>
                        <Box width={25}>
                            <Text color="gray">{dateStr}</Text>
                        </Box>
                        <Box width={40}>
                            <Text color={sess.task ? 'white' : 'gray'}>
                                {sess.task ? sess.task.slice(0, 38) : '(No active task)'}
                            </Text>
                        </Box>
                        <Box width={10}>
                            <Text color="gray">{sess.filesModified} files</Text>
                        </Box>
                    </Box>
                );
            })}

            <Box marginTop={1} borderStyle="single" borderTop={true} borderLeft={false} borderRight={false} borderBottom={false} borderColor="gray">
                <Text color="gray">
                    <Text bold color="white">Enter</Text> to resume · <Text bold color="red">D</Text> to delete · <Text bold>Esc</Text> to close
                </Text>
            </Box>
        </Box>
    );
};
