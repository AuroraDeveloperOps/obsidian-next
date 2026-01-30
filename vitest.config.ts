import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        exclude: ['**/node_modules/**', '**/dist/**', '**/workspace/**'],
        testTimeout: 60000,
    },
});
