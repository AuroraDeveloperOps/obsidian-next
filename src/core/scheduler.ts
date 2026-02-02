import cronParser from 'cron-parser';
import { db } from './database.js';
import { bus } from './bus.js';
import { context } from './context.js';
import { auditLog } from './auditLog.js';

// Handle CJS/ESM interop
// @ts-ignore
const parseExpression = cronParser.parseExpression || cronParser.default?.parseExpression || cronParser.parse || cronParser.default?.parse;

export interface ScheduledTask {
    id: string;
    session_id: string;
    cron_expression: string;
    command: string; // The ability name (e.g., 'system:echo')
    params?: string; // JSON string of parameters
    last_run_at: number;
    active: number; // 1 or 0
    next_run_at?: number; // Calculated field
}

export type AbilityFunction = (params: Record<string, any>) => Promise<void>;

export class Scheduler {
    private static instance: Scheduler;
    private abilities = new Map<string, AbilityFunction>();
    private timer: NodeJS.Timeout | null = null;
    private isRunning = false;

    private constructor() { }

    public static getInstance(): Scheduler {
        if (!Scheduler.instance) {
            Scheduler.instance = new Scheduler();
        }
        return Scheduler.instance;
    }

    /**
     * Initialize the scheduler loop
     */
    public start() {
        if (this.isRunning) return;
        this.isRunning = true;

        // Check every 60 seconds
        this.timer = setInterval(() => this.tick(), 60000);

        // Run immediately on start to catch missed tasks? 
        // No, let's wait for first tick to avoid startup storm
        bus.emitAgent({ type: 'thought', content: '[Scheduler] Started background task monitor' });
    }

    public stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
    }

    /**
     * Register a new ability that can be scheduled
     */
    public registerAbility(name: string, func: AbilityFunction) {
        this.abilities.set(name, func);
    }

    /**
     * Get list of registered abilities
     */
    public getAbilities(): string[] {
        return Array.from(this.abilities.keys());
    }

    /**
     * Schedule a new task
     */
    public async scheduleTask(cronExpression: string, abilityName: string, params: Record<string, any> = {}): Promise<ScheduledTask> {
        // Validate cron
        try {
            parseExpression(cronExpression);
        } catch (err) {
            throw new Error(`Invalid cron expression: ${cronExpression}`);
        }

        // Validate ability
        if (!this.abilities.has(abilityName)) {
            throw new Error(`Unknown ability: ${abilityName}`);
        }

        const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const sessionId = context.get().session_id;

        const task: ScheduledTask = {
            id,
            session_id: sessionId,
            cron_expression: cronExpression,
            command: abilityName,
            params: JSON.stringify(params),
            last_run_at: 0,
            active: 1
        };

        db.getDb().prepare(`
            INSERT INTO scheduled_tasks (id, session_id, cron_expression, command, last_run_at, active)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(task.id, task.session_id, task.cron_expression, task.command, task.last_run_at, task.active);

        bus.emitAgent({ type: 'thought', content: `[Scheduler] Scheduled ${abilityName} (${cronExpression})` });

        return task;
    }

    /**
     * List all active tasks
     */
    public listTasks(): ScheduledTask[] {
        const tasks = db.getDb().prepare(`
            SELECT * FROM scheduled_tasks WHERE active = 1
        `).all() as ScheduledTask[];

        return tasks.map(t => {
            try {
                const interval = parseExpression(t.cron_expression);
                t.next_run_at = interval.next().getTime();
            } catch {
                t.next_run_at = 0;
            }
            return t;
        });
    }

    /**
     * Main execution loop
     */
    private async tick() {
        const tasks = this.listTasks();
        const now = Date.now();

        for (const task of tasks) {
            try {
                const interval = parseExpression(task.cron_expression, {
                    currentDate: task.last_run_at || 0
                });

                // Check if it's due
                // We check if the NEXT scheduled run after the LAST run is <= NOW
                // Example: Last run 9:00. Cron: hourly. Next: 10:00. Now: 10:01. -> Run!

                // Special case: If never run (0), run immediately? 
                // Usually yes, or based on cron. 
                // If last_run_at is 0, parseExpression might default to now.

                // Let's use a safer check:
                // Get next occurrence from last_run_at (exclusive)
                // If that occurrence is in the past (<= now), we execute.

                const nextRun = interval.next().getTime();

                if (nextRun <= now) {
                    await this.executeTask(task);
                }
            } catch (error) {
                console.error(`[Scheduler] Error checking task ${task.id}:`, error);
            }
        }
    }

    private async executeTask(task: ScheduledTask) {
        const ability = this.abilities.get(task.command);
        if (!ability) {
            bus.emitAgent({ type: 'error', message: `Scheduler: Ability ${task.command} not found for task ${task.id}` });
            return; // TODO: Disable task?
        }

        bus.emitAgent({
            type: 'scheduler_task_started',
            taskId: task.id,
            command: task.command
        });

        try {
            let params = {};
            if (task.params) {
                try {
                    params = JSON.parse(task.params);
                } catch { }
            }

            await ability(params);

            // Update last_run_at
            db.getDb().prepare(`
                UPDATE scheduled_tasks SET last_run_at = ? WHERE id = ?
            `).run(Date.now(), task.id);

            bus.emitAgent({
                type: 'scheduler_task_completed',
                taskId: task.id
            });

        } catch (error: any) {
            console.error(`[Scheduler] Task ${task.id} failed:`, error);
            await auditLog.logSystemEvent('scheduler_error', { taskId: task.id, error: error.message });

            bus.emitAgent({ type: 'scheduler_task_failed', taskId: task.id, error: error.message });
        }
    }
}

export const scheduler = Scheduler.getInstance();
