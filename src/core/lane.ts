/**
 * Lane Queue - Serializes tool execution to prevent race conditions
 *
 * Ensures only one tool executes at a time within a lane.
 * Multiple lanes can be used for independent execution contexts.
 */

type QueuedTask<T> = {
	execute: () => Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
};

export class Lane {
	private queue: QueuedTask<unknown>[] = [];
	private running = false;

	/**
	 * Enqueue a task for serial execution.
	 * Returns a promise that resolves with the task's result.
	 */
	async enqueue<T>(execute: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push({
				execute,
				resolve: resolve as (v: unknown) => void,
				reject
			});
			this.drain();
		});
	}

	private async drain(): Promise<void> {
		if (this.running) return;
		this.running = true;

		while (this.queue.length > 0) {
			const task = this.queue.shift()!;
			try {
				const result = await task.execute();
				task.resolve(result);
			} catch (error) {
				task.reject(error);
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
}

/** Default tool execution lane - prevents concurrent tool execution */
export const toolLane = new Lane();
