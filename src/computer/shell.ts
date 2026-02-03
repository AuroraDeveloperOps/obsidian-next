// src/computer/shell.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { ExecutionError } from './errors';

const execAsync = promisify(exec);

export interface ShellInterface {
    execute(command: string): Promise<{ stdout: string; stderr: string }>;
}

export class RealShell implements ShellInterface {
    async execute(command: string): Promise<{ stdout: string; stderr: string }> {
        try {
            const { stdout, stderr } = await execAsync(command);
            return { stdout, stderr };
        } catch (error: any) {
            throw new ExecutionError(command, error.stderr || error.message);
        }
    }
}

export const shell: ShellInterface = new RealShell();
