import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { settings, Settings } from '../core/settings.js';
import { bus } from '../core/bus.js';

type MenuView = 'categories' | 'mode' | 'security' | 'ui' | 'permissions' | 'commands' | 'plan-confirm';

interface SettingsMenuProps {
    onClose: () => void;
}

interface MenuItem {
    key: string;
    label: string;
    type: 'toggle' | 'select' | 'category' | 'action';
    value?: boolean | string;
    options?: string[];
    description?: string;
}

/**
 * SettingsMenu - Interactive settings editor
 *
 * Navigate with arrow keys, Enter to select/toggle, Escape to go back
 */
export const SettingsMenu: React.FC<SettingsMenuProps> = ({ onClose }) => {
    const [view, setView] = useState<MenuView>('categories');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [currentSettings, setCurrentSettings] = useState<Settings | null>(null);
    const [saving, setSaving] = useState(false);

    // Load settings on mount
    useEffect(() => {
        settings.load().then(setCurrentSettings);
    }, []);

    // Reset selection when view changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [view]);

    const saveAndUpdate = useCallback(async (updates: Partial<Settings>) => {
        setSaving(true);
        await settings.save(updates);
        const updated = await settings.reload();
        setCurrentSettings(updated);
        setSaving(false);
    }, []);

    // Get menu items based on current view
    const getMenuItems = useCallback((): MenuItem[] => {
        if (!currentSettings) return [];

        switch (view) {
            case 'categories':
                return [
                    { key: 'mode', label: 'Execution Mode', type: 'category', description: `Current: ${currentSettings.mode} (Shift+Tab to cycle)` },
                    { key: 'security', label: 'Security', type: 'category', description: 'PII redaction, audit logging' },
                    { key: 'ui', label: 'UI Preferences', type: 'category', description: 'Syntax highlighting, colors' },
                    { key: 'permissions', label: 'Permissions', type: 'category', description: 'Allow/deny lists' },
                    { key: 'commands', label: 'Commands', type: 'category', description: 'Quick access to slash commands' },
                    { key: 'close', label: 'Close Settings', type: 'action' },
                ];

            case 'mode':
                return [
                    { key: 'auto', label: 'Auto Mode', type: 'select', value: currentSettings.mode === 'auto', description: 'Execute all commands without confirmation' },
                    { key: 'plan', label: 'Plan Mode', type: 'select', value: currentSettings.mode === 'plan', description: 'Read-only planning, approve before execution' },
                    { key: 'safe', label: 'Safe Mode', type: 'select', value: currentSettings.mode === 'safe', description: 'Require approval for all write operations' },
                    { key: 'back', label: 'Back', type: 'action' },
                ];

            case 'security':
                return [
                    { key: 'piiRedaction', label: 'PII Redaction', type: 'toggle', value: currentSettings.security.piiRedaction, description: 'Redact sensitive data before sending to AI' },
                    { key: 'auditLogging', label: 'Audit Logging', type: 'toggle', value: currentSettings.security.auditLogging, description: 'Log all commands and file operations' },
                    { key: 'keyBackend', label: 'Key Storage', type: 'category', description: `Current: ${currentSettings.security.keyBackend}` },
                    { key: 'back', label: 'Back', type: 'action' },
                ];

            case 'ui':
                return [
                    { key: 'syntaxHighlight', label: 'Syntax Highlighting', type: 'toggle', value: currentSettings.ui.syntaxHighlight, description: 'Colorize code output' },
                    { key: 'diffColors', label: 'Diff Colors', type: 'toggle', value: currentSettings.ui.diffColors, description: 'Show colored diffs' },
                    { key: 'showLineNumbers', label: 'Line Numbers', type: 'toggle', value: currentSettings.ui.showLineNumbers, description: 'Show line numbers in file output' },
                    { key: 'back', label: 'Back', type: 'action' },
                ];

            case 'permissions':
                const allowCount = currentSettings.permissions.allow.length;
                const denyCount = currentSettings.permissions.deny.length;
                return [
                    { key: 'viewAllow', label: 'View Allowed Patterns', type: 'category', description: `${allowCount} pattern(s)` },
                    { key: 'viewDeny', label: 'View Denied Patterns', type: 'category', description: `${denyCount} pattern(s)` },
                    { key: 'clearAllow', label: 'Clear Allowed Patterns', type: 'action', description: 'Reset allow list' },
                    { key: 'clearDeny', label: 'Clear Denied Patterns', type: 'action', description: 'Reset deny list' },
                    { key: 'back', label: 'Back', type: 'action' },
                ];

            case 'commands':
                return [
                    { key: 'cmd:init', label: '/init', type: 'action', description: 'Initialize configuration' },
                    { key: 'cmd:config', label: '/config', type: 'action', description: 'Edit configuration' },
                    { key: 'cmd:status', label: '/status', type: 'action', description: 'Show system status' },
                    { key: 'cmd:cost', label: '/cost', type: 'action', description: 'Show session cost' },
                    { key: 'cmd:clear', label: '/clear', type: 'action', description: 'Clear conversation' },
                    { key: 'cmd:exit', label: '/exit', type: 'action', description: 'Save and exit' },
                    { key: 'back', label: 'Back', type: 'action' },
                ];

            case 'plan-confirm':
                return [
                    { key: 'plan-execute', label: 'Execute Plan', type: 'action', description: 'Approve and execute the planned actions' },
                    { key: 'plan-modify', label: 'Modify Plan', type: 'action', description: 'Request changes to the plan' },
                    { key: 'plan-cancel', label: 'Cancel', type: 'action', description: 'Discard the plan' },
                    { key: 'plan-details', label: 'View Details', type: 'action', description: 'Show full plan details' },
                ];

            default:
                return [];
        }
    }, [view, currentSettings]);

    const items = getMenuItems();

    const handleSelect = useCallback(async () => {
        const item = items[selectedIndex];
        if (!item || !currentSettings) return;

        switch (item.type) {
            case 'category':
                if (item.key === 'keyBackend') {
                    // Cycle through key backends
                    const backends = ['auto', 'keychain', 'secret-tool', 'encrypted-file', 'env'] as const;
                    const currentIdx = backends.indexOf(currentSettings.security.keyBackend);
                    const nextBackend = backends[(currentIdx + 1) % backends.length];
                    await saveAndUpdate({ security: { ...currentSettings.security, keyBackend: nextBackend } });
                } else if (item.key === 'viewAllow') {
                    // Already shown in permissions view
                } else if (item.key === 'viewDeny') {
                    // Already shown in permissions view
                } else if (['mode', 'security', 'ui', 'permissions', 'commands'].includes(item.key)) {
                    setView(item.key as MenuView);
                }
                break;

            case 'toggle':
                if (view === 'security') {
                    await saveAndUpdate({
                        security: {
                            ...currentSettings.security,
                            [item.key]: !item.value
                        }
                    });
                } else if (view === 'ui') {
                    await saveAndUpdate({
                        ui: {
                            ...currentSettings.ui,
                            [item.key]: !item.value
                        }
                    });
                }
                break;

            case 'select':
                if (view === 'mode' && item.key !== 'back') {
                    await saveAndUpdate({ mode: item.key as 'auto' | 'plan' | 'safe' });
                }
                break;

            case 'action':
                if (item.key === 'back') {
                    setView('categories');
                } else if (item.key === 'close') {
                    onClose();
                } else if (item.key === 'clearAllow') {
                    await saveAndUpdate({ permissions: { ...currentSettings.permissions, allow: [] } });
                } else if (item.key === 'clearDeny') {
                    await saveAndUpdate({ permissions: { ...currentSettings.permissions, deny: [] } });
                } else if (item.key.startsWith('cmd:')) {
                    // Execute command
                    const cmd = item.key.replace('cmd:', '/');
                    onClose();
                    // Emit user input to trigger the command
                    bus.emitUser({ type: 'user_input', content: cmd });
                } else if (item.key === 'plan-execute') {
                    // Approve plan execution
                    bus.emitUser({ type: 'approval_response', approved: true, requestId: 'plan' });
                    onClose();
                } else if (item.key === 'plan-cancel') {
                    bus.emitUser({ type: 'approval_response', approved: false, requestId: 'plan' });
                    onClose();
                } else if (item.key === 'plan-modify') {
                    // Request modifications - emit a user message
                    bus.emitUser({ type: 'user_input', content: 'Please modify the plan' });
                    onClose();
                }
                break;
        }
    }, [items, selectedIndex, currentSettings, view, saveAndUpdate, onClose]);

    useInput((input, key) => {
        // Navigation
        if (key.upArrow) {
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1));
        }
        if (key.downArrow) {
            setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0));
        }

        // Selection
        if (key.return) {
            handleSelect();
        }

        // Back / Close
        if (key.escape) {
            if (view === 'categories') {
                onClose();
            } else {
                setView('categories');
            }
        }

        // Quick number selection
        const num = parseInt(input, 10);
        if (num >= 1 && num <= items.length) {
            setSelectedIndex(num - 1);
        }
    });

    if (!currentSettings) {
        return (
            <Box borderStyle="round" borderColor="cyan" padding={1}>
                <Text color="gray">Loading settings...</Text>
            </Box>
        );
    }

    const getViewTitle = () => {
        switch (view) {
            case 'categories': return 'Settings';
            case 'mode': return 'Execution Mode';
            case 'security': return 'Security Settings';
            case 'ui': return 'UI Preferences';
            case 'permissions': return 'Permission Lists';
            case 'commands': return 'Quick Commands';
            case 'plan-confirm': return 'Plan Review';
            default: return 'Settings';
        }
    };

    return (
        <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="cyan"
            paddingX={1}
            paddingY={0}
            marginY={1}
        >
            {/* Header with Mode Indicator */}
            <Box marginBottom={1} justifyContent="space-between">
                <Text bold color="cyan">[*] {getViewTitle()}</Text>
                <Box>
                    {saving && <Text color="yellow">Saving... </Text>}
                    <Text color="gray">Mode: </Text>
                    <Text
                        color={
                            currentSettings.mode === 'auto' ? 'green' :
                            currentSettings.mode === 'plan' ? 'yellow' : 'white'
                        }
                        bold
                    >
                        {currentSettings.mode.toUpperCase()}
                    </Text>
                </Box>
            </Box>

            {/* Menu Items */}
            <Box flexDirection="column" marginBottom={1}>
                {items.map((item, index) => {
                    const isSelected = index === selectedIndex;
                    const indicator = isSelected ? '>' : ' ';

                    // Render based on type
                    let valueDisplay = null;
                    if (item.type === 'toggle') {
                        valueDisplay = (
                            <Text color={item.value ? 'green' : 'red'}>
                                [{item.value ? 'ON' : 'OFF'}]
                            </Text>
                        );
                    } else if (item.type === 'select' && view === 'mode') {
                        valueDisplay = (
                            <Text color={item.value ? 'green' : 'gray'}>
                                {item.value ? '[*]' : '[ ]'}
                            </Text>
                        );
                    }

                    return (
                        <Box key={item.key} flexDirection="column">
                            <Box>
                                <Text color={isSelected ? 'cyan' : 'gray'}>{indicator} </Text>
                                <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>
                                    [{index + 1}] {item.label}
                                </Text>
                                {valueDisplay && <Text> </Text>}
                                {valueDisplay}
                            </Box>
                            {item.description && isSelected && (
                                <Box marginLeft={4}>
                                    <Text color="gray" dimColor>{item.description}</Text>
                                </Box>
                            )}
                        </Box>
                    );
                })}
            </Box>

            {/* Permission lists display */}
            {view === 'permissions' && (
                <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor="gray" paddingX={1}>
                    <Text color="gray" bold>Allowed patterns:</Text>
                    {currentSettings.permissions.allow.length === 0 ? (
                        <Text color="gray" dimColor>  (none)</Text>
                    ) : (
                        currentSettings.permissions.allow.slice(0, 5).map((p, i) => (
                            <Text key={i} color="green">  + {p}</Text>
                        ))
                    )}
                    {currentSettings.permissions.allow.length > 5 && (
                        <Text color="gray" dimColor>  ... and {currentSettings.permissions.allow.length - 5} more</Text>
                    )}

                    <Text color="gray" bold>Denied patterns:</Text>
                    {currentSettings.permissions.deny.length === 0 ? (
                        <Text color="gray" dimColor>  (none)</Text>
                    ) : (
                        currentSettings.permissions.deny.slice(0, 5).map((p, i) => (
                            <Text key={i} color="red">  - {p}</Text>
                        ))
                    )}
                    {currentSettings.permissions.deny.length > 5 && (
                        <Text color="gray" dimColor>  ... and {currentSettings.permissions.deny.length - 5} more</Text>
                    )}
                </Box>
            )}

            {/* Instructions */}
            <Box borderStyle="single" borderColor="gray" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} paddingTop={0}>
                <Text color="gray" dimColor>
                    Arrows: navigate | Enter: select | Esc: back | Shift+Tab: cycle mode
                </Text>
            </Box>
        </Box>
    );
};
