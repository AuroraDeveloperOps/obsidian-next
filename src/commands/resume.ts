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
import { session, SessionInfo } from '../core/session.js';
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

        const content = [
            'Saved Session Registry',
            ...sessions.slice(0, 10).map(s => {
                const date = new Date(s.savedAt);
                const dateStr = date.toLocaleDateString();
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const workspaceName = path.basename(s.workspace);
                return [
                    `   ⎿  [${s.id}]`,
                    `      ⎿  Date      ${dateStr} ${timeStr}`,
                    `      ⎿  Workspace ${workspaceName}`,
                    s.task ? `      ⎿  Task      ${s.task}` : null,
                    `      ⎿  Activity  ${s.filesModified} files handled`,
                    ''
                ].filter(Boolean).join('\n');
            }),
            sessions.length > 10 ? `   ... and ${sessions.length - 10} more sessions\n` : '',
            '   [Usage]',
            '   ⎿  /resume <id>      Restore session',
            '   ⎿  /resume --last    Restore latest',
            '',
        ].join('\n');

        bus.emitAgent({
            type: 'thought',
            content,
        });

        bus.emitAgent({
            type: 'done',
            summary: `${sessions.length} session(s) available.`,
        });
        return;
    }
    const sessionIdArg = args[0];
    // Unified Restore (Handles Context, History, Tasks, Usage)
    const result = await session.restore(sessionIdArg);
    if (!result.success) {
        bus.emitAgent({
            type: 'error',
            message: result.error || 'Failed to restore session',
        });
        return;
    }

    const currentTask = tasks.get();
    const currentContext = context.get();

    const content = [
        'Session Restored Successfully',
        `   ⎿  ID          ${sessionIdArg}`,
        `   ⎿  Root        ${path.basename(process.cwd())}`,
        '',
        '   [Restored State]',
        `   ⎿  Context     ${currentContext.files_read.length} files in set`,
        `   ⎿  History     ${(await history.load()).length} events rehydrated`,
        `   ⎿  Task        ${currentTask?.title || 'None'}`,
        '',
    ].join('\n');

    bus.emitAgent({
        type: 'thought',
        content,
    });

    bus.emitAgent({
        type: 'done',
        summary: `Session ${sessionIdArg} restored.`,
    });
};

/**
 * checkFileChanges functionality moved to core/session.ts or handled by DB in V13
 */
