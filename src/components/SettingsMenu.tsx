import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { settings, Settings } from '../core/settings.js';
import { config, Config } from '../core/config.js';
import { bus } from '../core/bus.js';
import { formatHeader } from '../utils/ui.js';

// Export this type so Root.tsx can use it
export type MenuView = 'categories' | 'mode' | 'security' | 'ui' | 'owl' | 'permissions' | 'commands' | 'plan-confirm' | 'models';

interface SettingsMenuProps {
    onClose: () => void;
    initialTab?: MenuView;
}

interface MenuItem {
    key: string;
    label: string;
    type: 'toggle' | 'select' | 'category' | 'action';
    value?: boolean | string;
    options?: string[];
    description?: string;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ onClose, initialTab }) => {
    const [view, setView] = useState<MenuView>(initialTab || 'categories');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [currentSettings, setCurrentSettings] = useState<Settings | null>(null);
    const [currentConfig, setCurrentConfig] = useState<Config | null>(null);
    const [saving, setSaving] = useState(false);

    // Confirmation State
    interface Confirmation {
        type: 'clear_allow' | 'clear_deny' | 'backend' | 'auto_mode';
        message: string;
        payload?: any;
    }
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

    // Load settings on mount
    useEffect(() => {
        settings.load().then(setCurrentSettings);
        config.load().then(setCurrentConfig);
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

    const saveConfigUpdate = useCallback(async (updates: Partial<Config>) => {
        if (!currentConfig) return;
        setSaving(true);
        const newConfig = { ...currentConfig, ...updates };
        await config.save(newConfig);
        const updated = await config.reload();
        setCurrentConfig(updated);
        setSaving(false);
    }, [currentConfig]);

    // Get menu items based on current view
    const getMenuItems = useCallback((): MenuItem[] => {
        if (!currentSettings || !currentConfig) return [];

        switch (view) {
            case 'categories':
                return [
                    { key: 'mode', label: 'Execution Mode', type: 'category', description: `Current: ${currentSettings.mode} (Shift+Tab to cycle)` },
                    { key: 'models', label: 'Model Selection', type: 'category', description: `Current: ${currentConfig.model.split('-').slice(0, 2).join(' ')}` },
                    { key: 'security', label: 'Security', type: 'category', description: 'PII, audit, sandbox' },
                    { key: 'ui', label: 'UI Preferences', type: 'category', description: 'Syntax, colors' },
                    { key: 'permissions', label: 'Permissions', type: 'category', description: 'Allow/deny lists' },
                    { key: 'commands', label: 'Commands', type: 'category', description: 'Quick access' },
                    { key: 'close', label: 'Close Settings', type: 'action' },
                ];
            case 'mode':
                return [
                    { key: 'auto', label: 'Auto Mode', type: 'select', value: currentSettings.mode === 'auto', description: 'Execute without confirmation (Use with caution)' },
                    { key: 'plan', label: 'Plan Mode', type: 'select', value: currentSettings.mode === 'plan', description: 'Read-only planning' },
                    { key: 'safe', label: 'Safe Mode', type: 'select', value: currentSettings.mode === 'safe', description: 'Require approval for writes' },
                    { key: 'back', label: 'Back', type: 'action' },
                ];
            case 'models':
                const currentModel = currentConfig.model;
                return [
                    { key: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', type: 'select', value: currentModel.includes('sonnet'), description: 'Balanced' },
                    { key: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', type: 'select', value: currentModel.includes('haiku'), description: 'Fastest' },
                    { key: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5', type: 'select', value: currentModel.includes('opus'), description: 'Most capable' },
                    { key: 'back', label: 'Back', type: 'action' },
                ];
            case 'security':
                return [
                    { key: 'piiRedaction', label: 'PII Redaction', type: 'toggle', value: currentSettings.security.piiRedaction, description: 'Redact sensitive data' },
                    { key: 'auditLogging', label: 'Audit Logging', type: 'toggle', value: currentSettings.security.auditLogging, description: 'Log operations' },
                    { key: 'sandbox', label: 'Sandbox Filesystem', type: 'toggle', value: currentSettings.security.sandbox, description: 'Restrict file access' },
                    { key: 'keyBackend', label: 'Key Storage', type: 'category', description: `Current: ${currentSettings.security.keyBackend}` },
                    { key: 'back', label: 'Back', type: 'action' },
                ];
            case 'ui':
                return [
                    { key: 'syntaxHighlight', label: 'Syntax Highlighting', type: 'toggle', value: currentSettings.ui.syntaxHighlight, description: 'Colorize code' },
                    { key: 'diffColors', label: 'Diff Colors', type: 'toggle', value: currentSettings.ui.diffColors, description: 'Show colored diffs' },
                    { key: 'showLineNumbers', label: 'Line Numbers', type: 'toggle', value: currentSettings.ui.showLineNumbers, description: 'Show line numbers' },
                    { key: 'owl', label: 'Owl Animation', type: 'category', description: currentSettings.ui.owlAnimation?.enabled ? 'Enabled' : 'Disabled' },
                    { key: 'back', label: 'Back', type: 'action' },
                ];
            case 'owl':
                const owlSettings = currentSettings.ui.owlAnimation || { enabled: true, flyWhenIdle: true, idleTimeout: 60000, sleepTimeout: 300000 };
                return [
                    { key: 'owlEnabled', label: 'Enable Owl', type: 'toggle', value: owlSettings.enabled, description: 'Show owl animation in dashboard' },
                    { key: 'owlFly', label: 'Fly When Idle', type: 'toggle', value: owlSettings.flyWhenIdle, description: 'Owl flies around when idle' },
                    { key: 'owlIdleTimeout', label: 'Idle Timeout', type: 'category', description: `${owlSettings.idleTimeout / 1000}s` },
                    { key: 'owlSleepTimeout', label: 'Sleep Timeout', type: 'category', description: `${owlSettings.sleepTimeout / 1000}s` },
                    { key: 'back', label: 'Back', type: 'action' },
                ];
            case 'permissions':
                return [
                    { key: 'viewAllow', label: 'View Allowed', type: 'category', description: `${currentSettings.permissions.allow.length} patterns` },
                    { key: 'viewDeny', label: 'View Denied', type: 'category', description: `${currentSettings.permissions.deny.length} patterns` },
                    { key: 'clearAllow', label: 'Clear Allowed', type: 'action', description: 'Reset allow list' },
                    { key: 'clearDeny', label: 'Clear Denied', type: 'action', description: 'Reset deny list' },
                    { key: 'back', label: 'Back', type: 'action' },
                ];
            case 'commands':
                return [
                    { key: 'cmd:init', label: '/init', type: 'action', description: 'Initialize' },
                    { key: 'cmd:config', label: '/config', type: 'action', description: 'Edit config' },
                    { key: 'cmd:status', label: '/status', type: 'action', description: 'System status' },
                    { key: 'cmd:context', label: '/context', type: 'action', description: 'Context & usage' },
                    { key: 'cmd:clear', label: '/clear', type: 'action', description: 'Clear history' },
                    { key: 'cmd:exit', label: '/exit', type: 'action', description: 'Save & Exit' },
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
    }, [view, currentSettings, currentConfig]);

    const items = getMenuItems();

    // Handlers
    const handleConfirmation = useCallback(async (approved: boolean) => {
        if (!confirmation || !currentSettings) {
            setConfirmation(null);
            return;
        }

        if (approved) {
            switch (confirmation.type) {
                case 'auto_mode':
                    await saveAndUpdate({ mode: 'auto' });
                    break;
                case 'backend':
                    await saveAndUpdate({ security: { ...currentSettings.security, keyBackend: confirmation.payload } });
                    break;
                case 'clear_allow':
                    await saveAndUpdate({ permissions: { ...currentSettings.permissions, allow: [] } });
                    break;
                case 'clear_deny':
                    await saveAndUpdate({ permissions: { ...currentSettings.permissions, deny: [] } });
                    break;
            }
        }
        setConfirmation(null);
    }, [confirmation, currentSettings, saveAndUpdate]);

    const handleSelect = useCallback(async () => {
        const item = items[selectedIndex];
        if (!item || !currentSettings) return;

        // Routing & Toggles
        if (item.type === 'category') {
            if (item.key === 'keyBackend') {
                // Confirm backend switch
                const backends = ['auto', 'keychain', 'secret-tool', 'encrypted-file', 'env'] as const;
                const currentIdx = backends.indexOf(currentSettings.security.keyBackend);
                const nextBackend = backends[(currentIdx + 1) % backends.length];
                setConfirmation({
                    type: 'backend',
                    message: `Switch key storage to '${nextBackend}'? Re-auth required.`,
                    payload: nextBackend
                });
            } else if (['mode', 'models', 'security', 'ui', 'owl', 'permissions', 'commands'].includes(item.key)) {
                setView(item.key as MenuView);
            } else if (item.key === 'owlIdleTimeout') {
                // Cycle through idle timeout options: 30s, 60s, 120s, 300s
                const owlSettings = currentSettings.ui.owlAnimation || { enabled: true, flyWhenIdle: true, idleTimeout: 60000, sleepTimeout: 300000 };
                const timeouts = [30000, 60000, 120000, 300000];
                const currentIdx = timeouts.indexOf(owlSettings.idleTimeout);
                const nextTimeout = timeouts[(currentIdx + 1) % timeouts.length];
                await saveAndUpdate({ ui: { ...currentSettings.ui, owlAnimation: { ...owlSettings, idleTimeout: nextTimeout } } });
            } else if (item.key === 'owlSleepTimeout') {
                // Cycle through sleep timeout options: 60s, 180s, 300s, 600s
                const owlSettings = currentSettings.ui.owlAnimation || { enabled: true, flyWhenIdle: true, idleTimeout: 60000, sleepTimeout: 300000 };
                const timeouts = [60000, 180000, 300000, 600000];
                const currentIdx = timeouts.indexOf(owlSettings.sleepTimeout);
                const nextTimeout = timeouts[(currentIdx + 1) % timeouts.length];
                await saveAndUpdate({ ui: { ...currentSettings.ui, owlAnimation: { ...owlSettings, sleepTimeout: nextTimeout } } });
            }
        } else if (item.type === 'toggle') {
            if (view === 'security') {
                await saveAndUpdate({ security: { ...currentSettings.security, [item.key]: !item.value } });
            } else if (view === 'ui') {
                await saveAndUpdate({ ui: { ...currentSettings.ui, [item.key]: !item.value } });
            } else if (view === 'owl') {
                const owlSettings = currentSettings.ui.owlAnimation || { enabled: true, flyWhenIdle: true, idleTimeout: 60000, sleepTimeout: 300000 };
                if (item.key === 'owlEnabled') {
                    await saveAndUpdate({ ui: { ...currentSettings.ui, owlAnimation: { ...owlSettings, enabled: !item.value } } });
                } else if (item.key === 'owlFly') {
                    await saveAndUpdate({ ui: { ...currentSettings.ui, owlAnimation: { ...owlSettings, flyWhenIdle: !item.value } } });
                }
            }
        } else if (item.type === 'select') {
            if (view === 'mode' && item.key !== 'back') {
                if (item.key === 'auto' && !item.value) {
                    setConfirmation({
                        type: 'auto_mode',
                        message: 'Enable Auto Mode? (Disables human-in-the-loop)'
                    });
                } else {
                    await saveAndUpdate({ mode: item.key as any });
                }
            } else if (view === 'models' && item.key !== 'back') {
                await saveConfigUpdate({ model: item.key });
            }
        } else if (item.type === 'action') {
            if (item.key === 'back') {
                // Go back to parent view
                if (view === 'owl') setView('ui');
                else setView('categories');
            }
            else if (item.key === 'close') onClose();
            else if (item.key === 'clearAllow') setConfirmation({ type: 'clear_allow', message: 'Flush allow-list rules?' });
            else if (item.key === 'clearDeny') setConfirmation({ type: 'clear_deny', message: 'Flush deny-list rules?' });
            else if (item.key.startsWith('cmd:')) {
                const cmd = item.key.replace('cmd:', '/');
                // For immediate commands like clear/exit, we close and emit content
                // For view navigation like /status, we might want to stay active or route appropriately
                // The Root handler will catch this emission
                onClose();
                bus.emitUser({ type: 'user_input', content: cmd });
            } else if (item.key === 'plan-execute') {
                bus.emitUser({ type: 'approval_response', approved: true, requestId: 'plan', scope: 'session' });
                onClose();
            } else if (item.key === 'plan-cancel') {
                bus.emitUser({ type: 'approval_response', approved: false, requestId: 'plan', scope: 'session' });
                onClose();
            } else if (item.key === 'plan-modify') {
                bus.emitUser({ type: 'user_input', content: 'Please modify the plan' });
                onClose();
            }
        }
    }, [items, selectedIndex, currentSettings, view, saveAndUpdate, saveConfigUpdate, onClose]);

    // Input Handling
    useInput((input, key) => {
        if (!currentSettings) return;

        // Confirmation Input
        if (confirmation) {
            if (input === 'y' || input === 'Y' || key.return) handleConfirmation(true);
            else if (input === 'n' || input === 'N' || key.escape) handleConfirmation(false);
            return;
        }

        // Menu Input
        if (key.upArrow) setSelectedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1));
        if (key.downArrow) setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0));
        if (key.return) handleSelect();
        if (key.escape) {
            if (view === 'categories') onClose();
            else if (view === 'owl') setView('ui');
            else setView('categories');
        }
        // Numeric shortcut
        const num = parseInt(input, 10);
        if (num >= 1 && num <= items.length) setSelectedIndex(num - 1);
    });

    if (!currentSettings || !currentConfig) {
        return (
            <Box padding={1}>
                <Text color="gray">Loading settings...</Text>
            </Box>
        );
    }

    if (confirmation) {
        return (
            <Box flexDirection="column" paddingX={1} width="100%" height="100%" justifyContent="center">
                <Box marginBottom={1}><Text color="red" bold>[ ! ] Confirmation Required</Text></Box>
                <Box marginBottom={1}><Text color="white">{confirmation.message}</Text></Box>
                <Box>
                    <Text color="gray">      </Text>
                    <Text color="red" bold>(y)</Text>
                    <Text color="gray"> Confirm   </Text>
                    <Text color="red" bold>(n)</Text>
                    <Text color="gray"> Cancel</Text>
                </Box>
            </Box>
        );
    }

    const getViewTitle = () => {
        switch (view) {
            case 'categories': return 'Settings';
            case 'mode': return 'Execution Mode';
            case 'models': return 'Model Selection';
            case 'security': return 'Security Settings';
            case 'ui': return 'UI Preferences';
            case 'owl': return 'Owl Animation';
            case 'permissions': return 'Permission Lists';
            case 'commands': return 'Quick Commands';
            case 'plan-confirm': return 'Plan Review';
            default: return 'Settings';
        }
    };

    return (
        <Box
            flexDirection="column"
            paddingX={1}
            paddingY={0}
            width="100%"
            height="100%"
        >
            {/* Minimal Header */}
            <Box marginBottom={1} flexDirection="row" justifyContent="flex-start">
                <Text bold color="white">[ {getViewTitle()} ]</Text>
                <Box marginLeft={2}>
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

            {/* Menu Items - Borderless */}
            <Box flexDirection="column" marginBottom={1}>
                {items.map((item, index) => {
                    const isSelected = index === selectedIndex;
                    const indicator = isSelected ? '>' : ' ';

                    // Render based on type
                    let valueDisplay = null;
                    if (item.type === 'toggle') {
                        valueDisplay = (
                            <Text color={item.value ? 'green' : 'red'}>
                                {item.value ? 'ON' : 'OFF'}
                            </Text>
                        );
                    } else if (item.type === 'select' && view === 'mode') {
                        valueDisplay = (
                            <Text color={item.value ? 'green' : 'gray'}>
                                {item.value ? '[*]' : '[ ]'}
                            </Text>
                        );
                    } else if (item.type === 'select' && view === 'models') {
                        valueDisplay = (
                            <Text color={item.value ? 'green' : 'gray'}>
                                {item.value ? ' (Active)' : ''}
                            </Text>
                        );
                    }

                    return (
                        <Box key={item.key} flexDirection="column" marginBottom={0}>
                            <Box>
                                <Text color={isSelected ? 'red' : 'gray'}>{indicator} </Text>
                                <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>
                                    {item.label}
                                </Text>
                                {valueDisplay && <Text>  </Text>}
                                {valueDisplay}
                            </Box>
                            {/* Description inline if possible, or next line dimmed */}
                            {item.description && isSelected && (
                                <Box marginLeft={2}>
                                    <Text color="gray" dimColor>  {item.description}</Text>
                                </Box>
                            )}
                        </Box>
                    );
                })}
            </Box>

            {/* Permission lists display - Minimal List */}
            {view === 'permissions' && (
                <Box flexDirection="column" marginBottom={1} paddingX={0}>
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

                    <Box marginTop={1}>
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
                </Box>
            )}

            {/* Minimal Footer */}
            <Box marginTop={1}>
                <Text color="gray" dimColor>
                    Arrows: navigate  Enter: select  Esc: back  Shift+Tab: cycle mode
                </Text>
            </Box>
        </Box>
    );
};
