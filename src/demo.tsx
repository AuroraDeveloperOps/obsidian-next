import React from 'react';
import { render, Box, Text } from 'ink';
import { AgentLine } from './components/AgentLine.js';
import { ToolOutput } from './components/ToolOutput.js';
import { MorphSpinner } from './components/MorphSpinner.js';

const Demo = () => {
    return (
        <Box flexDirection="column" padding={1}>
            <Text bold underline>Obsidian Next UI Demo</Text>
            <Box height={1} />

            <AgentLine content="Analyzing project structure..." />
            <MorphSpinner text="Churning data..." />

            <Box height={1} />

            <AgentLine content="Found 3 configuration files." />
            <ToolOutput tool="Bash(ls -la)" output="-rw-r--r-- package.json\n-rw-r--r-- tsconfig.json" />

            <Box height={1} />

            <AgentLine content="Encountered an error:" />
            <ToolOutput tool="Bash(rm /root)" output="Permission denied" isError />
        </Box>
    );
};

render(<Demo />);
