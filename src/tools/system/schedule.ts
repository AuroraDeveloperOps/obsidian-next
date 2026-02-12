/**
 * Schedule Tool - Create recurring or one-time background tasks
 */

import { scheduler } from '../../core/scheduler.js';
import { Tool, ToolResult } from '../shared.js';

// Parse human-readable interval strings into cron expressions.
// Supports: "every 5m", "every 2h", "hourly", "daily", "daily at 3pm",
// "weekly", "every monday at 9am", "every weekday at 9am", "every weekend at 10am"
// Returns null if the string cannot be parsed.
function parseHumanInterval(input: string): string | null {
	const s = input.trim().toLowerCase();

	const dayMap: Record<string, string> = {
		sunday: '0',
		sun: '0',
		monday: '1',
		mon: '1',
		tuesday: '2',
		tue: '2',
		wednesday: '3',
		wed: '3',
		thursday: '4',
		thu: '4',
		friday: '5',
		fri: '5',
		saturday: '6',
		sat: '6'
	};

	// Helper to parse "at Xam/pm" or "at HH:MM" from a string
	function parseTime(str: string): { hour: number; minute: number } {
		const atMatch = str.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
		if (atMatch) {
			let hour = parseInt(atMatch[1], 10);
			const minute = atMatch[2] ? parseInt(atMatch[2], 10) : 0;
			const ampm = atMatch[3]?.toLowerCase();
			if (ampm === 'pm' && hour < 12) hour += 12;
			if (ampm === 'am' && hour === 12) hour = 0;
			return { hour, minute };
		}
		return { hour: 9, minute: 0 }; // default 9:00 AM
	}

	// "every Xm" / "every X minutes"
	const minMatch = s.match(/^every\s+(\d+)\s*(?:m|min|mins|minutes?)$/);
	if (minMatch) {
		const n = parseInt(minMatch[1], 10);
		if (n < 1 || n > 59) return null;
		return `*/${n} * * * *`;
	}

	// "every Xh" / "every X hours"
	const hourMatch = s.match(/^every\s+(\d+)\s*(?:h|hrs?|hours?)$/);
	if (hourMatch) {
		const n = parseInt(hourMatch[1], 10);
		if (n < 1 || n > 23) return null;
		return `0 */${n} * * *`;
	}

	// "hourly"
	if (s === 'hourly') return '0 * * * *';

	// "daily" or "daily at Xam/pm"
	if (s.startsWith('daily')) {
		const { hour, minute } = parseTime(s);
		return `${minute} ${hour} * * *`;
	}

	// "weekly" or "weekly at Xam/pm"
	if (s.startsWith('weekly')) {
		const { hour, minute } = parseTime(s);
		return `${minute} ${hour} * * 1`;
	}

	// "every weekday at Xam/pm"
	if (s.includes('weekday')) {
		const { hour, minute } = parseTime(s);
		return `${minute} ${hour} * * 1-5`;
	}

	// "every weekend at Xam/pm"
	if (s.includes('weekend')) {
		const { hour, minute } = parseTime(s);
		return `${minute} ${hour} * * 0,6`;
	}

	// "every <dayname>" or "every <dayname> at Xam/pm"
	for (const [dayName, dayNum] of Object.entries(dayMap)) {
		if (s.includes(dayName)) {
			const { hour, minute } = parseTime(s);
			return `${minute} ${hour} * * ${dayNum}`;
		}
	}

	return null;
}

// Parse a one-time schedule string into a Date object.
// Supports: "tomorrow at 3pm", "tuesday at 10am", "next wednesday at 2:30pm",
// "in 30 minutes", "in 2 hours". Returns null if not parseable.
function parseOneTimeSchedule(input: string): Date | null {
	const s = input.trim().toLowerCase();

	const dayMap: Record<string, number> = {
		sunday: 0,
		sun: 0,
		monday: 1,
		mon: 1,
		tuesday: 2,
		tue: 2,
		wednesday: 3,
		wed: 3,
		thursday: 4,
		thu: 4,
		friday: 5,
		fri: 5,
		saturday: 6,
		sat: 6
	};

	function parseTime(str: string): { hour: number; minute: number } {
		const atMatch = str.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
		if (atMatch) {
			let hour = parseInt(atMatch[1], 10);
			const minute = atMatch[2] ? parseInt(atMatch[2], 10) : 0;
			const ampm = atMatch[3]?.toLowerCase();
			if (ampm === 'pm' && hour < 12) hour += 12;
			if (ampm === 'am' && hour === 12) hour = 0;
			return { hour, minute };
		}
		return { hour: 9, minute: 0 };
	}

	// "in X minutes"
	const inMinMatch = s.match(/^in\s+(\d+)\s*(?:m|min|mins|minutes?)$/);
	if (inMinMatch) {
		const d = new Date();
		d.setMinutes(d.getMinutes() + parseInt(inMinMatch[1], 10));
		return d;
	}

	// "in X hours"
	const inHourMatch = s.match(/^in\s+(\d+)\s*(?:h|hrs?|hours?)$/);
	if (inHourMatch) {
		const d = new Date();
		d.setHours(d.getHours() + parseInt(inHourMatch[1], 10));
		return d;
	}

	// "tomorrow at Xam/pm"
	if (s.startsWith('tomorrow')) {
		const { hour, minute } = parseTime(s);
		const d = new Date();
		d.setDate(d.getDate() + 1);
		d.setHours(hour, minute, 0, 0);
		return d;
	}

	// "<dayname> at Xam/pm" or "next <dayname> at Xam/pm"
	for (const [dayName, dayNum] of Object.entries(dayMap)) {
		if (s.includes(dayName)) {
			const { hour, minute } = parseTime(s);
			const now = new Date();
			const currentDay = now.getDay();
			let daysUntil = dayNum - currentDay;
			if (daysUntil <= 0) daysUntil += 7; // Always go to next occurrence
			const d = new Date();
			d.setDate(d.getDate() + daysUntil);
			d.setHours(hour, minute, 0, 0);
			return d;
		}
	}

	return null;
}

export const ScheduleTool: Tool = {
	name: 'schedule_task',
	description: `Schedule a background task. Supports recurring cron jobs and one-time scheduled events.

RECURRING - use "interval" (human-readable) or "cron" (raw expression):
  interval: "every 5m", "every 2h", "hourly", "daily at 3pm", "weekly", "every monday at 9am", "every weekday at 9am"
  cron: "*/5 * * * *", "0 9 * * 1-5" (standard 5-field cron)

ONE-TIME - use "at" for a single future execution:
  at: "tomorrow at 3pm", "tuesday at 10am", "in 30 minutes", "in 2 hours"

ABILITIES (what to execute):
  system:notify  - Sound alert + native notification + voice (params: title, message, sound, speak)
  system:bash    - Run a shell command (params: command)
  system:echo    - Log a message (params: message)
  system:summary - Show usage/cost stats
  system:heartbeat - Silent liveness check
  system:audit   - Proactive security scan of workspace
  system:index   - Regenerate codebase MAP.md

Provide EITHER cron/interval (recurring) OR at (one-time), plus ability and optional params.`,
	inputSchema: {
		cron: {
			type: 'string',
			description:
				'Raw cron expression (e.g., "*/5 * * * *", "0 9 * * 1-5"). Use this OR interval, not both.'
		},
		interval: {
			type: 'string',
			description:
				'Human-readable interval (e.g., "every 5m", "daily at 3pm", "every monday at 9am"). Converted to cron internally.'
		},
		at: {
			type: 'string',
			description:
				'One-time schedule (e.g., "tomorrow at 3pm", "tuesday at 10am", "in 30 minutes"). Task runs once then deactivates.'
		},
		ability: {
			type: 'string',
			description:
				'Ability to execute: system:notify, system:bash, system:echo, system:summary, system:heartbeat, system:audit, system:index'
		},
		params: {
			type: 'string',
			description:
				'JSON string of parameters. For system:notify: {"title":"...","message":"...","sound":"Glass","speak":true}. For system:bash: {"command":"..."}. For system:echo: {"message":"..."}'
		}
	},
	requiredParams: ['ability'],

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		const cronRaw = args.cron as string | undefined;
		const interval = args.interval as string | undefined;
		const at = args.at as string | undefined;
		const ability = args.ability as string;
		const paramsStr = (args.params as string) || '{}';

		if (!ability) {
			return { success: false, error: 'Ability name is required' };
		}

		let params: Record<string, unknown> = {};
		try {
			params = JSON.parse(paramsStr);
		} catch {
			return { success: false, error: 'Invalid JSON parameters' };
		}

		// One-time schedule via "at"
		if (at) {
			const targetDate = parseOneTimeSchedule(at);
			if (!targetDate) {
				return {
					success: false,
					error: `Could not parse one-time schedule: "${at}". Try "tomorrow at 3pm", "tuesday at 10am", or "in 30 minutes".`
				};
			}

			if (targetDate.getTime() <= Date.now()) {
				return {
					success: false,
					error: `Scheduled time is in the past: ${targetDate.toLocaleString()}`
				};
			}

			// Convert to a cron that fires at the exact minute, then we'll deactivate after first run
			const cronExpr = `${targetDate.getMinutes()} ${targetDate.getHours()} ${targetDate.getDate()} ${targetDate.getMonth() + 1} *`;

			try {
				const task = await scheduler.scheduleTask(cronExpr, ability, {
					...params,
					__once: true,
					__target: targetDate.getTime()
				});
				return {
					success: true,
					output: `Scheduled one-time task ${task.id}: ${ability} at ${targetDate.toLocaleString()}`
				};
			} catch (error: unknown) {
				return {
					success: false,
					error: `Failed to schedule: ${error instanceof Error ? error.message : String(error)}`
				};
			}
		}

		// Recurring schedule
		if (!cronRaw && !interval) {
			return {
				success: false,
				error:
					'Provide cron, interval, or at. Examples: cron="*/5 * * * *", interval="every 5m", at="tomorrow at 3pm"'
			};
		}

		if (cronRaw && interval) {
			return {
				success: false,
				error: 'Provide either cron or interval, not both.'
			};
		}

		let cronExpr: string;
		if (interval) {
			const parsed = parseHumanInterval(interval);
			if (!parsed) {
				return {
					success: false,
					error: `Could not parse interval: "${interval}". Try "every 5m", "hourly", "daily at 3pm", "every monday at 9am".`
				};
			}
			cronExpr = parsed;
		} else {
			cronExpr = cronRaw!;
		}

		try {
			const task = await scheduler.scheduleTask(cronExpr, ability, params);
			const source = interval
				? `interval="${interval}" -> cron="${cronExpr}"`
				: `cron="${cronExpr}"`;
			return {
				success: true,
				output: `Scheduled recurring task ${task.id}: ${ability} (${source})`
			};
		} catch (error: unknown) {
			return {
				success: false,
				error: `Failed to schedule task: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
};
