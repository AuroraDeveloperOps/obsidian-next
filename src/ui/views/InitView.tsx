import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { keyManager } from '../../core/keyManager.js';

interface InitViewProps {
	onClose: () => void;
}

export const InitView = ({ onClose }: InitViewProps) => {
	const [apiKey, setApiKey] = useState('');
	const [isSubmitted, setIsSubmitted] = useState(false);
	const [error, setError] = useState('');

	const handleSubmit = async () => {
		if (!apiKey.trim()) {
			setError('API Key cannot be empty.');
			return;
		}

		try {
			const result = await keyManager.storeKey(apiKey.trim());
			if (result.success) {
				setIsSubmitted(true);
				// Close the view after a short delay
				setTimeout(onClose, 1500);
			} else {
				setError(`Failed to save key: ${result.error || 'Unknown error'}`);
			}
		} catch (e: any) {
			setError(`Failed to save config: ${e.message}`);
		}
	};

	if (isSubmitted) {
		return (
			<Box
				flexDirection="column"
				padding={1}
				borderStyle="round"
				borderColor="green"
			>
				<Text color="green">✔ API Key saved successfully!</Text>
				<Text>Closing...</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1} borderStyle="round">
			<Box marginBottom={1}>
				<Text bold>Initial Configuration</Text>
			</Box>
			<Text>
				Please enter your API Key. It will be stored securely in your local
				configuration.
			</Text>

			<Box marginTop={1} flexDirection="row">
				<Text bold>API Key: </Text>
				<TextInput
					value={apiKey}
					onChange={setApiKey}
					onSubmit={handleSubmit}
					placeholder="sk-..."
					mask="*"
				/>
			</Box>

			{error && (
				<Box marginTop={1}>
					<Text color="red">{error}</Text>
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>(Press Enter to submit, Esc to close)</Text>
			</Box>
		</Box>
	);
};
