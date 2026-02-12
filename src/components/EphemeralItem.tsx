import React, { useState, useEffect } from 'react';
import { Box } from 'ink';

interface EphemeralItemProps {
	children: React.ReactNode;
	delay?: number;
}

export const EphemeralItem: React.FC<EphemeralItemProps> = ({
	children,
	delay = 5000
}) => {
	const [visible, setVisible] = useState(true);

	useEffect(() => {
		const timer = setTimeout(() => {
			setVisible(false);
		}, delay);

		return () => clearTimeout(timer);
	}, [delay]);

	if (!visible) return null;

	return <Box>{children}</Box>;
};
