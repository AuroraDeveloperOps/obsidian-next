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

        // Run immediately on start
        this.tick().catch(err => console.error('[Scheduler] Initial tick failed:', err));

        // Check every 10 seconds for better precision
        this.timer = setInterval(() => this.tick(), 10000);

        bus.emitAgent({ type: 'thought', content: '[Obsidian] Started background task monitor [Active Heartbeat]' });
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
            last_run_at: Date.now(),
            active: 1
        };

        db.getDb().prepare(`
            INSERT INTO scheduled_tasks (id, session_id, cron_expression, command, params, last_run_at, active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(task.id, task.session_id, task.cron_expression, task.command, task.params, task.last_run_at, task.active);

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

        // Heartbeat for debugging
        // console.log(`[Scheduler] Heartbeat tick at ${new Date().toLocaleTimeString()} | Active Tasks: ${tasks.length}`);

        for (const task of tasks) {
            try {
                // If last_run_at is 0, we use a baseline of 1 minute ago to avoid skipping 
                // but also prevent it from thinking it's due for 50 years of catchup
                const baseline = task.last_run_at || (now - 61000);

                // One-time tasks: check if target time has passed
                let taskParams: any = {};
                try { taskParams = task.params ? JSON.parse(task.params) : {}; } catch {}

                if (taskParams.__once && taskParams.__target) {
                    if (now >= taskParams.__target) {
                        await this.executeTask(task);
                    }
                    continue;
                }

                const interval = parseExpression(task.cron_expression, {
                    currentDate: baseline
                });

                const nextRun = interval.next().getTime();

                // Execute if the next scheduled run is in the past or right now
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

            bus.emitAgent({
                type: 'scheduler_task_completed',
                taskId: task.id,
                command: task.command
            });

            // One-time tasks: deactivate after first successful execution
            if (params.__once) {
                db.getDb().prepare(`UPDATE scheduled_tasks SET active = 0 WHERE id = ?`).run(task.id);
                bus.emitAgent({ type: 'thought', content: `[Scheduler] One-time task ${task.id} completed and deactivated.` });
            }

        } catch (error: any) {
            console.error(`[Scheduler] Task ${task.id} failed:`, error);
            await auditLog.logSystemEvent('scheduler_error', { taskId: task.id, error: error.message });

            bus.emitAgent({ type: 'scheduler_task_failed', taskId: task.id, command: task.command, error: error.message });
        } finally {
            // Update last_run_at REGARDLESS of success to avoid refiring loops
            db.getDb().prepare(`
                UPDATE scheduled_tasks SET last_run_at = ? WHERE id = ?
            `).run(Date.now(), task.id);
        }
    }

    /**
     * Remove (deactivate) a scheduled task
     */
    public async removeTask(taskId: string): Promise<boolean> {
        const result = db.getDb().prepare(`
            UPDATE scheduled_tasks SET active = 0 WHERE id = ?
        `).run(taskId);

        if (result.changes && result.changes > 0) {
            bus.emitAgent({ type: 'thought', content: `[Scheduler] Deactivated task: ${taskId}` });
            return true;
        }
        return false;
    }
}

export const scheduler = Scheduler.getInstance();
