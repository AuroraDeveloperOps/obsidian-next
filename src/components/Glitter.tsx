import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

const FRAMES = ['*', '.', '*'];

interface GlitterProps {
	children?: React.ReactNode;
}

export const Glitter: React.FC<GlitterProps> = ({ children }) => {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => {
			setFrame((f) => (f + 1) % FRAMES.length);
		}, 400);
		return () => clearInterval(timer);
	}, []);

	return (
		<Text dimColor>
			{FRAMES[frame]} {children}
		</Text>
	);
};
