/**
 * Lane Queue - Serializes tool execution to prevent race conditions
 *
 * Multi-lane architecture allows parallel execution of independent operations:
 * - READ_LANE: Concurrent read operations (list, read, grep, glob)
 * - WRITE_LANE: Serialized write operations (write, edit, delete)
 * - EXEC_LANE: Serialized command execution (bash, computer)
 * - NETWORK_LANE: Concurrent network operations (http, web-fetch)
 */

type QueuedTask<T> = {
	execute: () => Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
	priority?: number;
	timestamp: number;
};

export class Lane {
	private queue: QueuedTask<unknown>[] = [];
	private running = false;
	private concurrency: number;
	private activeCount = 0;

	constructor(concurrency = 1) {
		this.concurrency = concurrency;
	}

	/**
	 * Enqueue a task for execution.
	 * Returns a promise that resolves with the task's result.
	 *
	 * @param execute - The task to execute
	 * @param priority - Higher priority tasks execute first (default: 0)
	 */
	async enqueue<T>(execute: () => Promise<T>, priority = 0): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push({
				execute,
				resolve: resolve as (v: unknown) => void,
				reject,
				priority,
				timestamp: Date.now()
			});

			// Sort queue by priority (descending), then timestamp (ascending)
			this.queue.sort((a, b) => {
				if (a.priority !== b.priority) {
					return (b.priority || 0) - (a.priority || 0);
				}
				return a.timestamp - b.timestamp;
			});

			this.drain();
		});
	}

	private async drain(): Promise<void> {
		if (this.running) return;
		this.running = true;

		while (this.queue.length > 0) {
			// Execute up to concurrency limit
			const tasks: Promise<void>[] = [];

			while (
				this.queue.length > 0 &&
				this.activeCount < this.concurrency
			) {
				const task = this.queue.shift()!;
				this.activeCount++;

				const taskPromise = (async () => {
					try {
						const result = await task.execute();
						task.resolve(result);
					} catch (error) {
						task.reject(error);
					} finally {
						this.activeCount--;
					}
				})();

				tasks.push(taskPromise);
			}

			// Wait for this batch to complete
			if (tasks.length > 0) {
				await Promise.all(tasks);
			}
		}

		this.running = false;
	}

	get pending(): number {
		return this.queue.length;
	}

	get isRunning(): boolean {
		return this.running;
	}

	get active(): number {
		return this.activeCount;
	}

	/**
	 * Clear all pending tasks (useful for shutdown/cleanup)
	 */
	clear(): void {
		for (const task of this.queue) {
			task.reject(new Error('Lane cleared'));
		}
		this.queue = [];
	}
}

// ===== MULTI-LANE ARCHITECTURE =====

/**
 * READ_LANE: High concurrency for safe read operations
 * Allows multiple reads in parallel (no race conditions)
 */
export const READ_LANE = new Lane(5);

/**
 * WRITE_LANE: Serial execution for write operations
 * Prevents concurrent writes to same file (race condition protection)
 */
export const WRITE_LANE = new Lane(1);

/**
 * EXEC_LANE: Serial execution for shell commands
 * Prevents command interaction issues (stdin/stdout collision)
 */
export const EXEC_LANE = new Lane(1);

/**
 * NETWORK_LANE: Moderate concurrency for network operations
 * Allows parallel API calls while respecting rate limits
 */
export const NETWORK_LANE = new Lane(3);

/**
 * Default tool execution lane (legacy compatibility)
 * @deprecated Use specific lanes (READ_LANE, WRITE_LANE, etc.) instead
 */
export const toolLane = WRITE_LANE;
