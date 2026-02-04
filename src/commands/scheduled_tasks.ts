import { bus } from '../core/bus.js';
import { scheduler } from '../core/scheduler.js';
import { CommandHandler } from '../core/commands.js';

export const scheduledTasksCommand: CommandHandler = async (_args) => {
    const tasks = scheduler.listTasks();

    if (tasks.length === 0) {
        bus.emitAgent({ type: 'thought', content: 'No scheduled tasks found.' });
        return;
    }

    const output = [
        'Scheduled Tasks:',
        'ID         CRON Expression    Command        Last Run                     Next Run',
        '-------------------------------------------------------------------------------------'
    ];

    for (const task of tasks) {
        const lastRun = task.last_run_at ? new Date(task.last_run_at).toLocaleString() : 'N/A';
        const nextRun = task.next_run_at ? new Date(task.next_run_at).toLocaleString() : 'N/A';
        output.push(
            `${task.id.padEnd(10)} ${task.cron_expression.padEnd(17)} ${task.command.padEnd(14)} ${lastRun.padEnd(28)} ${nextRun}`
        );
    }

    bus.emitAgent({ type: 'thought', content: output.join('\n') });
};
