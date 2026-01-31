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
            setFrame(f => (f + 1) % FRAMES.length);
        }, 80);
        return () => clearInterval(timer);
    }, []);

    const glyph = FRAMES[frame];

    // Color interpolation logic based on frame intensity
    // Center frames (index 4-6) are brightest/reddest
    let color = 'gray'; // Default dim
    if (frame === 2 || frame === 8) color = 'white';
    if (frame === 3 || frame === 7) color = 'red';
    if (frame >= 4 && frame <= 6) color = 'red'; // Bright Red (using bold + red for intensity)

    return (
        <Text>
            <Text color={color} bold={frame >= 4 && frame <= 6}>
                {glyph}
            </Text>
            {children ? <Text> </Text> : null}
            {children}
        </Text>
    );
};
