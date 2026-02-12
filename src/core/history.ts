import { db } from './database.js';
import { AgentEvent } from '../events/types.js';
import { context } from './context.js';

export class HistoryManager {
	private saveTimer: NodeJS.Timeout | null = null;

	constructor() {}

	async load(): Promise<AgentEvent[]> {
		const currentSessionId = context.get().session_id;
		if (!currentSessionId) return [];

		try {
			const rows = db
				.getDb()
				.prepare(
					`
                SELECT content FROM events 
                WHERE session_id = ? 
                ORDER BY timestamp ASC
            `
				)
				.all(currentSessionId) as { content: string }[];

			return rows.map((r) => JSON.parse(r.content));
		} catch (e) {
			console.error('Failed to load history:', e);
			return [];
		}
	}

	async save(events: AgentEvent[]) {
		// Debounce save (500ms)
		if (this.saveTimer) clearTimeout(this.saveTimer);

		this.saveTimer = setTimeout(async () => {
			const currentSessionId = context.get().session_id;
			if (!currentSessionId) return;

			try {
				const transaction = db.getDb().transaction(() => {
					// Sync strategy: Delete all events for this session and re-insert.
					// This handles edits/undo correctly.
					db.getDb()
						.prepare('DELETE FROM events WHERE session_id = ?')
						.run(currentSessionId);

					const insert = db.getDb().prepare(`
                        INSERT INTO events (session_id, type, content, timestamp)
                        VALUES (?, ?, ?, ?)
                    `);

					for (const event of events) {
						insert.run(
							currentSessionId,
							event.type,
							JSON.stringify(event),
							event.timestamp || Date.now()
						);
					}
				});

				transaction();
			} catch (error) {
				console.error('Failed to save history:', error);
			}
		}, 500);
	}

	async archive(events: AgentEvent[]) {
		// No-op. History is persistent in SQLite.
		return null;
	}

	async clear() {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		const currentSessionId = context.get().session_id;
		if (!currentSessionId) return;

		try {
			db.getDb()
				.prepare('DELETE FROM events WHERE session_id = ?')
				.run(currentSessionId);
		} catch {
			// ignore
		}
	}
}

export const history = new HistoryManager();
