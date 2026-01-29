import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { AgentEvent } from '../events/types.js';

export class HistoryManager {
    private historyPath: string;
    private saveTimer: NodeJS.Timeout | null = null;

    constructor(customPath?: string) {
        this.historyPath = customPath || path.join(os.homedir(), '.obsidian', 'history.json');
    }

    async load(): Promise<AgentEvent[]> {
        try {
            const data = await fs.readFile(this.historyPath, 'utf-8');
            const events = JSON.parse(data);
            return Array.isArray(events) ? events : [];
        } catch {
            return [];
        }
    }

    async save(events: AgentEvent[]) {
        // Debounce save (500ms)
        if (this.saveTimer) clearTimeout(this.saveTimer);

        this.saveTimer = setTimeout(async () => {
            try {
                const dir = path.dirname(this.historyPath);
                await fs.mkdir(dir, { recursive: true });
                await fs.writeFile(this.historyPath, JSON.stringify(events, null, 2));
            } catch (error) {
                // Squelch save errors in background
                console.error('Failed to save history:', error);
            }
        }, 500);
    }

    async clear() {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        try {
            await fs.writeFile(this.historyPath, JSON.stringify([], null, 2));
        } catch {
            // ignore
        }
    }
}

export const history = new HistoryManager();
