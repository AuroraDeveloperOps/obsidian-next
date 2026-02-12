import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

// The "Breathing Star" sequence
const FRAMES = ['·', '•', '●', '✦', '✶', '✴', '✶', '✦', '●', '•', '·'];

interface GlitterProps {
	children?: React.ReactNode;
}

export const Glitter: React.FC<GlitterProps> = ({ children }) => {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => {
			setFrame((f) => (f + 1) % FRAMES.length);
		}, 80);
		return () => clearInterval(timer);
	}, []);

	const glyph = FRAMES[frame];

	// Color interpolation logic based on frame intensity
	// Shimmer effect for children: cycle between gray and white
	const shimmerColors = [
		'#555555',
		'#777777',
		'#999999',
		'#bbbbbb',
		'#dddddd',
		'#ffffff',
		'#dddddd',
		'#bbbbbb',
		'#999999',
		'#777777',
		'#555555'
	];
	const shimmerColor = shimmerColors[frame % shimmerColors.length];

	let color = 'gray'; // Default dim
	if (frame === 2 || frame === 8) color = 'white';
	if (frame >= 3 && frame <= 7) color = 'red';

	return (
		<Text>
			<Text color={color} bold={frame >= 4 && frame <= 6}>
				{glyph}
			</Text>
			{children ? <Text> </Text> : null}
			{children ? <Text color={shimmerColor}>{children}</Text> : null}
		</Text>
	);
};
