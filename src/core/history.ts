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

    async archive(events: AgentEvent[]) {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        try {
            const sessionsDir = path.join(path.dirname(this.historyPath), 'sessions');
            await fs.mkdir(sessionsDir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const archivePath = path.join(sessionsDir, `session-${timestamp}.json`);

            await fs.writeFile(archivePath, JSON.stringify(events, null, 2));
            return archivePath;
        } catch (error) {
            console.error('Failed to archive session:', error);
            return null;
        }
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
