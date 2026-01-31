import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { config } from '../../core/config.js';
import { tools } from '../../core/tools.js';
import { sandbox } from '../../core/sandbox.js';
import Anthropic from '@anthropic-ai/sdk';
import { useInput } from 'ink';

interface CheckResult {
    name: string;
    status: 'ok' | 'warn' | 'error';
    message: string;
}

interface DoctorViewProps {
    onClose: () => void;
}

export const DoctorView: React.FC<DoctorViewProps> = ({ onClose }) => {
    const [results, setResults] = useState<CheckResult[]>([]);
    const [loading, setLoading] = useState(true);

    const runDiagnostics = async () => {
        setLoading(true);
        const checks: CheckResult[] = [];

        // 1. Check configuration
        try {
            const cfg = await config.load();
            if (cfg.apiKey) {
                checks.push({
                    name: 'API Key',
                    status: 'ok',
                    message: `Configured (***${cfg.apiKey.slice(-4)})`
                });
            } else {
                checks.push({
                    name: 'API Key',
                    status: 'error',
                    message: 'Not set. Run /init'
                });
            }

            checks.push({
                name: 'Model',
                status: 'ok',
                message: cfg.model
            });
        } catch (e) {
            checks.push({
                name: 'Config',
                status: 'error',
                message: 'Failed to load config'
            });
        }

        // 2. Check tools
        const toolList = tools.list();
        checks.push({
            name: 'Tools',
            status: 'ok',
            message: `${toolList.length} registered`
        });

        // 3. Check sandbox
        const sandboxAvailable = await sandbox.isAvailable();
        checks.push({
            name: 'Sandbox',
            status: sandboxAvailable ? 'ok' : 'warn',
            message: sandboxAvailable ? 'Available' : 'Not available'
        });

        // 4. Check API connectivity (lightweight)
        try {
            const cfg = await config.load();
            if (cfg.apiKey) {
                // Just instantiate, don't ping to save cost/time
                new Anthropic({ apiKey: cfg.apiKey });
                checks.push({
                    name: 'API Client',
                    status: 'ok',
                    message: 'Initialized'
                });
            }
        } catch (e: any) {
            checks.push({
                name: 'API Client',
                status: 'error',
                message: e.message || 'Error'
            });
        }

        // 5. Check Node
        const nodeVer = process.version;
        const major = parseInt(nodeVer.slice(1).split('.')[0]);
        checks.push({
            name: 'Node.js',
            status: major >= 18 ? 'ok' : 'warn',
            message: nodeVer
        });

        setResults(checks);
        setLoading(false);
    };

    useEffect(() => {
        runDiagnostics();
    }, []);

    useInput((input, key) => {
        if (key.escape) {
            onClose();
        }
        if (input === 'r' || input === 'R') {
            runDiagnostics();
        }
    });

    return (
        <Box flexDirection="column" width="100%" height="100%" paddingX={1} paddingY={0}>
            <Box marginBottom={1}>
                <Text bold color="cyan">[*] System Diagnostics</Text>
            </Box>

            {loading ? (
                <Text>Running checks...</Text>
            ) : (
                <Box flexDirection="column">
                    {results.map((r, i) => (
                        <Box key={i} flexDirection="row" justifyContent="space-between" marginBottom={0}>
                            <Box width={15}>
                                <Text bold>{r.name}</Text>
                            </Box>
                            <Box>
                                <Text
                                    color={
                                        r.status === 'ok' ? 'green' :
                                            r.status === 'warn' ? 'yellow' : 'red'
                                    }
                                >
                                    [{r.status.toUpperCase()}] {r.message}
                                </Text>
                            </Box>
                        </Box>
                    ))}
                </Box>
            )}

            <Box marginTop={1} borderStyle="single" borderLeft={false} borderRight={false} borderBottom={false} borderTop={true} borderColor="gray" paddingTop={0}>
                <Text color="gray" dimColor>Press 'r' to reload • Esc to close</Text>
            </Box>
        </Box>
    );
};
