// src/computer/errors.ts

export class ComputerError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ComputerError';
	}
}

export class DependencyMissingError extends ComputerError {
	constructor(dependency: string, installCommand?: string) {
		const message = `Required dependency "${dependency}" is missing.${installCommand ? ` Install it using: ${installCommand}` : ''}`;
		super(message);
		this.name = 'DependencyMissingError';
	}
}

export class ExecutionError extends ComputerError {
	constructor(command: string, stderr: string) {
		super(`Command failed: ${command}\nError: ${stderr}`);
		this.name = 'ExecutionError';
	}
}

export class ScreenshotError extends ComputerError {
	constructor(message: string, originalError?: any) {
		super(
			`Screenshot capture failed: ${message}${originalError ? ` (${originalError.message})` : ''}`
		);
		this.name = 'ScreenshotError';
	}
}
