/**
 * Git Commands - /commit, /branch, /pr, /diff
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { bus } from '../core/bus.js';

const execAsync = promisify(exec);

async function runGit(args: string): Promise<{ stdout: string; stderr: string }> {
    try {
        return await execAsync(`git ${args}`, {
            cwd: process.cwd(),
            timeout: 30000,
        });
    } catch (error: any) {
        return { stdout: '', stderr: error.message };
    }
}

/**
 * /commit - Stage and commit changes
 */
export async function commitCommand(args: string[]): Promise<void> {
    const message = args.join(' ');

    if (!message) {
        // Show status
        const { stdout } = await runGit('status --short');
        if (!stdout.trim()) {
            bus.emitAgent({ type: 'thought', content: 'Nothing to commit' });
            return;
        }
        bus.emitAgent({
            type: 'thought',
            content: `Uncommitted changes:\n${stdout}\n\nUsage: /commit <message>`
        });
        return;
    }

    // Stage all changes
    await runGit('add -A');

    // Commit
    const { stdout, stderr } = await runGit(`commit -m "${message.replace(/"/g, '\\"')}"`);

    if (stderr && !stdout) {
        bus.emitAgent({ type: 'error', message: stderr });
        return;
    }

    bus.emitAgent({ type: 'thought', content: stdout || 'Committed' });
}

/**
 * /branch - List, create, or switch branches
 */
export async function branchCommand(args: string[]): Promise<void> {
    const subcommand = args[0];

    if (!subcommand) {
        // List branches
        const { stdout } = await runGit('branch -a');
        bus.emitAgent({ type: 'thought', content: stdout || 'No branches' });
        return;
    }

    if (subcommand === 'new' || subcommand === 'create') {
        const name = args[1];
        if (!name) {
            bus.emitAgent({ type: 'error', message: 'Usage: /branch new <name>' });
            return;
        }
        const { stdout, stderr } = await runGit(`checkout -b ${name}`);
        bus.emitAgent({ type: 'thought', content: stdout || stderr || `Created branch: ${name}` });
        return;
    }

    if (subcommand === 'switch' || subcommand === 'checkout') {
        const name = args[1];
        if (!name) {
            bus.emitAgent({ type: 'error', message: 'Usage: /branch switch <name>' });
            return;
        }
        const { stdout, stderr } = await runGit(`checkout ${name}`);
        bus.emitAgent({ type: 'thought', content: stdout || stderr || `Switched to: ${name}` });
        return;
    }

    if (subcommand === 'delete') {
        const name = args[1];
        if (!name) {
            bus.emitAgent({ type: 'error', message: 'Usage: /branch delete <name>' });
            return;
        }
        const { stdout, stderr } = await runGit(`branch -d ${name}`);
        bus.emitAgent({ type: 'thought', content: stdout || stderr || `Deleted: ${name}` });
        return;
    }

    // Assume it's a branch name to switch to
    const { stdout, stderr } = await runGit(`checkout ${subcommand}`);
    bus.emitAgent({ type: 'thought', content: stdout || stderr || `Switched to: ${subcommand}` });
}

/**
 * /diff - Show uncommitted changes
 */
export async function diffCommand(args: string[]): Promise<void> {
    const file = args[0];

    const cmd = file ? `diff ${file}` : 'diff';
    const { stdout } = await runGit(cmd);

    if (!stdout.trim()) {
        bus.emitAgent({ type: 'thought', content: 'No changes' });
        return;
    }

    // Truncate if too long
    const maxLines = 50;
    const lines = stdout.split('\n');
    const truncated = lines.length > maxLines
        ? lines.slice(0, maxLines).join('\n') + `\n\n... (${lines.length - maxLines} more lines)`
        : stdout;

    bus.emitAgent({ type: 'thought', content: truncated });
}

/**
 * /push - Push to remote
 */
export async function pushCommand(args: string[]): Promise<void> {
    const remote = args[0] || 'origin';
    const branch = args[1];

    // Get current branch if not specified
    let targetBranch = branch;
    if (!targetBranch) {
        const { stdout } = await runGit('branch --show-current');
        targetBranch = stdout.trim();
    }

    bus.emitAgent({ type: 'thought', content: `Pushing to ${remote}/${targetBranch}...` });

    const { stdout, stderr } = await runGit(`push ${remote} ${targetBranch}`);
    bus.emitAgent({ type: 'thought', content: stdout || stderr || 'Pushed' });
}

/**
 * /pull - Pull from remote
 */
export async function pullCommand(args: string[]): Promise<void> {
    const remote = args[0] || 'origin';

    bus.emitAgent({ type: 'thought', content: `Pulling from ${remote}...` });

    const { stdout, stderr } = await runGit(`pull ${remote}`);
    bus.emitAgent({ type: 'thought', content: stdout || stderr || 'Pulled' });
}

/**
 * /log - Show recent commits
 */
export async function logCommand(args: string[]): Promise<void> {
    const count = parseInt(args[0]) || 10;

    const { stdout } = await runGit(`log --oneline -${count}`);
    bus.emitAgent({ type: 'thought', content: stdout || 'No commits' });
}
