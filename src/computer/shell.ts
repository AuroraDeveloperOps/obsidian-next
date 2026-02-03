// src/computer/shell.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { ExecutionError } from './errors';

const execAsync = promisify(exec);

export interface ShellInterface {
    execute(command: string): Promise<{ stdout: string; stderr: string }>;
}

export class RealShell implements ShellInterface {
    async execute(command: string, timeout: number = 30000): Promise<{ stdout: string; stderr: string }> {
        try {
            const { stdout, stderr } = await execAsync(command, {
                timeout,
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });
            return { stdout, stderr };
        } catch (error: any) {
            if (error.killed) {
                throw new ExecutionError(command, `Command timed out after ${timeout}ms`);
            }
            throw new ExecutionError(command, error.stderr || error.message);
        }
    }
}

export const shell: ShellInterface = new RealShell();
