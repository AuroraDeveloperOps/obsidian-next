/**
 * /resume command - Restore a saved session
 *
 * Usage:
 *   /resume           - List available sessions
 *   /resume <id>      - Restore specific session
 *   /resume --last    - Restore most recent session
 *   /resume --delete <id> - Delete a saved session
 */

import { bus } from '../core/bus.js';
import { session, SavedSession } from '../core/session.js';
import { context } from '../core/context.js';
import { history } from '../core/history.js';
import { tasks } from '../core/tasks.js';
import { llm } from '../core/llm.js';
import { CommandHandler } from '../core/commands.js';
import path from 'path';

export const resumeCommand: CommandHandler = async (args) => {
    // Handle --delete
    if (args[0] === '--delete' || args[0] === '-d') {
        const sessionId = args[1];
        if (!sessionId) {
            bus.emitAgent({
                type: 'error',
                message: 'Usage: /resume --delete <session_id>',
            });
            return;
        }

        const deleted = await session.delete(sessionId);
        if (deleted) {
            bus.emitAgent({
                type: 'done',
                summary: `Session ${sessionId} deleted.`,
            });
        } else {
            bus.emitAgent({
                type: 'error',
                message: `Session ${sessionId} not found.`,
            });
        }
        return;
    }

    // Handle --last
    if (args[0] === '--last' || args[0] === '-l') {
        const sessions = await session.list();
        if (sessions.length === 0) {
            bus.emitAgent({
                type: 'error',
                message: 'No saved sessions found.',
            });
            return;
        }
        args[0] = sessions[0].id;
    }

    // List sessions if no ID provided
    if (!args[0]) {
        const sessions = await session.list();

        if (sessions.length === 0) {
            bus.emitAgent({
                type: 'thought',
                content: 'No saved sessions found.\n\nSessions are created when you run /exit.',
            });
            bus.emitAgent({
                type: 'done',
                summary: 'No sessions available.',
            });
            return;
        }

        const lines = [
            '='.repeat(50),
            'SAVED SESSIONS',
            '='.repeat(50),
            '',
        ];

        for (const s of sessions.slice(0, 10)) {
            const date = new Date(s.savedAt);
            const dateStr = date.toLocaleDateString();
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const workspaceName = path.basename(s.workspace);

            lines.push(`[${s.id}]`);
            lines.push(`  Date:      ${dateStr} ${timeStr}`);
            lines.push(`  Workspace: ${workspaceName}`);
            if (s.task) {
                lines.push(`  Task:      ${s.task}`);
            }
            lines.push(`  Modified:  ${s.filesModified} files`);
            lines.push('');
        }

        if (sessions.length > 10) {
            lines.push(`... and ${sessions.length - 10} more sessions`);
            lines.push('');
        }

        lines.push('Usage: /resume <session_id>');
        lines.push('       /resume --last');
        lines.push('='.repeat(50));

        bus.emitAgent({
            type: 'thought',
            content: lines.join('\n'),
        });

        bus.emitAgent({
            type: 'done',
            summary: `${sessions.length} session(s) available.`,
        });
        return;
    }

    // Load specific session
    const sessionId = args[0];
    const savedSession = await session.load(sessionId);

    if (!savedSession) {
        bus.emitAgent({
            type: 'error',
            message: `Session ${sessionId} not found.`,
        });
        return;
    }

    // Check workspace match
    const currentWorkspace = process.cwd();
    if (savedSession.workspace !== currentWorkspace) {
        bus.emitAgent({
            type: 'thought',
            content: [
                '[WARN] Workspace mismatch:',
                `  Session workspace: ${savedSession.workspace}`,
                `  Current workspace: ${currentWorkspace}`,
                '',
                'Some file paths may not resolve correctly.',
            ].join('\n'),
        });
    }

    // Restore context
    await restoreContext(savedSession);

    // Restore history
    await restoreHistory(savedSession);

    // Restore task
    await restoreTask(savedSession);

    // Reset session timer
    session.resetStartTime();

    // Check for files that have changed since session was saved
    const changedFiles = await checkFileChanges(savedSession);

    const lines = [
        '='.repeat(50),
        'SESSION RESTORED',
        '='.repeat(50),
        '',
        `Session ID: ${savedSession.id}`,
        `Saved:      ${new Date(savedSession.savedAt).toLocaleString()}`,
        '',
        '[Restored]',
        `  Context:  ${savedSession.context.files_read.length} files in working set`,
        `  History:  ${savedSession.history.length} events`,
        `  Task:     ${savedSession.task?.title || 'None'}`,
        '',
    ];

    if (changedFiles.length > 0) {
        lines.push('[WARN] Files changed since session was saved:');
        for (const file of changedFiles.slice(0, 5)) {
            lines.push(`  - ${file}`);
        }
        if (changedFiles.length > 5) {
            lines.push(`  ... and ${changedFiles.length - 5} more`);
        }
        lines.push('');
    }

    lines.push('='.repeat(50));

    bus.emitAgent({
        type: 'thought',
        content: lines.join('\n'),
    });

    bus.emitAgent({
        type: 'done',
        summary: `Session ${sessionId} restored.`,
    });
};

/**
 * Restore context from saved session
 */
async function restoreContext(savedSession: SavedSession): Promise<void> {
    // We need to manually restore context fields
    // The context manager doesn't have a bulk restore, so we'll track files
    await context.init();

    for (const file of savedSession.context.files_read) {
        await context.trackRead(file);
    }

    for (const file of savedSession.context.files_modified) {
        await context.trackModified(file);
    }

    if (savedSession.context.current_task) {
        await context.setTask(savedSession.context.current_task);
    }

    if (savedSession.context.last_action) {
        await context.setLastAction(savedSession.context.last_action);
    }
}

/**
 * Restore history from saved session
 */
async function restoreHistory(savedSession: SavedSession): Promise<void> {
    // Clear current history and restore saved
    await history.clear();

    // Emit restored events to rebuild UI
    bus.emitAgent({ type: 'clear_history' });

    // Re-emit historical events (but don't re-execute tools)
    for (const event of savedSession.history) {
        // Skip certain events that shouldn't be replayed
        if (event.type === 'approval_request' || event.type === 'choice_request') {
            continue;
        }
        bus.emitAgent(event);
    }
}

/**
 * Restore task from saved session
 */
async function restoreTask(savedSession: SavedSession): Promise<void> {
    if (!savedSession.task) return;

    await tasks.init();
    await tasks.create(savedSession.task.title);

    // Restore subtasks
    for (const subtask of savedSession.task.subtasks) {
        await tasks.addSubtask(subtask.text);
        if (subtask.done) {
            const currentTask = tasks.get();
            if (currentTask) {
                const idx = currentTask.subtasks.length - 1;
                await tasks.completeSubtask(idx);
            }
        }
    }

    // Restore status
    await tasks.setStatus(savedSession.task.status);

    // Restore context
    for (const ctx of savedSession.task.context) {
        await tasks.addContext(ctx);
    }
}

/**
 * Check if files have changed since session was saved
 */
async function checkFileChanges(savedSession: SavedSession): Promise<string[]> {
    const changedFiles: string[] = [];
    const fs = await import('fs/promises');

    for (const file of savedSession.context.files_modified) {
        try {
            const fullPath = path.resolve(savedSession.workspace, file);
            const stats = await fs.stat(fullPath);
            const savedTime = new Date(savedSession.savedAt).getTime();

            if (stats.mtimeMs > savedTime) {
                changedFiles.push(file);
            }
        } catch {
            // File may have been deleted
            changedFiles.push(`${file} (missing)`);
        }
    }

    return changedFiles;
}
