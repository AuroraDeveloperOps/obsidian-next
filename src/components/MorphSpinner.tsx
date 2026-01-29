import React, { useState, useEffect } from 'react';
import { Text } from 'ink';
import Spinner from 'ink-spinner';

interface MorphSpinnerProps {
    text: string;
}

/**
 * MorphSpinner Component
 * Standard ASCII Spinner for professional output.
 * Uses 'dots' spinner from ink-spinner (classic cli look).
 */
export const MorphSpinner: React.FC<MorphSpinnerProps> = ({ text }) => {
    return (
        <Text>
            <Text color="cyan">
                <Spinner type="dots" />
            </Text>
            {' ' + text}
        </Text>
    );
};
