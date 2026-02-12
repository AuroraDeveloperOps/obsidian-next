import React, { useEffect, useState } from 'react';
import { Box } from 'ink';

export const FullScreen: React.FC<{ children: React.ReactNode }> = ({
	children
}) => {
	const [dimensions, setDimensions] = useState({
		rows: process.stdout.rows || 24,
		columns: process.stdout.columns || 80
	});

	useEffect(() => {
		process.stdout.write('\x1b[?1049h');
		process.stdout.write('\x1bc');

		const handleResize = () => {
			setDimensions({
				rows: process.stdout.rows || 24,
				columns: process.stdout.columns || 80
			});
		};

		process.stdout.on('resize', handleResize);

		return () => {
			process.stdout.off('resize', handleResize);
			process.stdout.write('\x1b[?1049l');
		};
	}, []);

	return (
		<Box width="100%" height={dimensions.rows} flexDirection="column">
			{children}
		</Box>
	);
};
