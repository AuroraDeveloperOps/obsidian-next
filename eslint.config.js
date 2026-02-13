import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
	js.configs.recommended,
	{
		files: ['src/**/*.ts', 'src/**/*.tsx'],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				project: './tsconfig.json'
			},
			globals: {
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				setTimeout: 'readonly',
				setInterval: 'readonly',
				clearTimeout: 'readonly',
				clearInterval: 'readonly'
			}
		},
		plugins: {
			'@typescript-eslint': tseslint
		},
		rules: {
			// TypeScript-specific rules
			'@typescript-eslint/no-unused-vars': 'warn', // Demote to warning
			'@typescript-eslint/no-explicit-any': 'off', // Too many to fix now
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off', // Too many to fix now
			'@typescript-eslint/no-floating-promises': 'warn', // Demote to warning
			'@typescript-eslint/await-thenable': 'warn',
			'@typescript-eslint/no-misused-promises': 'warn',

			// General rules
			'no-console': 'off', // CLI app needs console
			'no-debugger': 'error',
			'no-alert': 'error',
			'prefer-const': 'warn',
			'no-var': 'error',
			'no-undef': 'off', // TypeScript handles this
			'no-unused-vars': 'off', // Use TypeScript version
			'eqeqeq': ['warn', 'always'],
			'curly': 'off', // Too strict
			'no-throw-literal': 'warn',
			'no-empty': 'warn',
			'no-case-declarations': 'warn',

			// Security rules (keep as errors)
			'no-eval': 'error',
			'no-implied-eval': 'error',
			'no-new-func': 'error',
			'no-script-url': 'error'
		}
	},
	{
		files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module'
			},
			globals: {
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly'
			}
		},
		plugins: {
			'@typescript-eslint': tseslint
		},
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-floating-promises': 'off',
			'@typescript-eslint/no-unused-vars': 'off'
		}
	},
	{
		ignores: [
			'node_modules/**',
			'dist/**',
			'.test-*/**',
			'*.config.js',
			'coverage/**'
		]
	},
	prettier
];
