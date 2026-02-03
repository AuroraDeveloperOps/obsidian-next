// src/computer/utils.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function wait(duration: number): Promise<void> {
  await execAsync(`sleep ${duration}`);
}
