import fs from 'fs/promises';
import path from 'path';
import { config } from './config.js';

export class MemoryManager {
    private memoryPath: string;
    private context: string = '';

    constructor() {
        // We resolve this properly in init()
        this.memoryPath = '';
    }

    async init() {
        const cfg = await config.load();
        const obsidianDir = path.join(cfg.workspaceRoot || process.cwd(), '.obsidian');
        this.memoryPath = path.join(obsidianDir, 'session_context.md');

        try {
            this.context = await fs.readFile(this.memoryPath, 'utf-8');
        } catch {
            this.context = '# Session Memory\n\nNo persistent context yet.\n';
            await this.save();
        }
    }

    async getMemory(): Promise<string> {
        if (!this.memoryPath) await this.init();
        return this.context;
    }

    async append(summary: string) {
        if (!this.memoryPath) await this.init();

        const timestamp = new Date().toISOString();
        const entry = `\n## Entry [${timestamp}]\n${summary}\n`;
        this.context += entry;
        await this.save();
    }

    async update(newContext: string) {
        if (!this.memoryPath) await this.init();
        this.context = newContext;
        await this.save();
    }

    private async save() {
        try {
            await fs.mkdir(path.dirname(this.memoryPath), { recursive: true });
            await fs.writeFile(this.memoryPath, this.context);
        } catch (error) {
            console.error('Failed to save memory:', error);
        }
    }
}

export const memory = new MemoryManager();
