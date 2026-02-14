/**
 * Skills Manager - Registry of default and user skills with enable/disable
 *
 * Persists skill state to ~/.obsidian-next/skills.json
 * Default skills are bundled; user skills live in ~/.obsidian-next/skills/
 */

import fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import os from 'os';
import { bus } from './bus.js';

export interface SkillMeta {
	name: string;
	description: string;
	source: 'default' | 'user';
	filename: string;
	enabled: boolean;
}

interface SkillsConfig {
	disabled: string[]; // Names of disabled skills
}

const SKILLS_DIR = path.join(os.homedir(), '.obsidian-next', 'skills');
const SKILLS_CONFIG = path.join(os.homedir(), '.obsidian-next', 'skills.json');

class SkillsManager {
	private config: SkillsConfig = { disabled: [] };
	private defaultSkillsDir: string;

	constructor() {
		// Resolve relative to compiled output
		this.defaultSkillsDir = path.join(
			path.dirname(new URL(import.meta.url).pathname),
			'..', 'skills', 'defaults'
		);
	}

	async init(): Promise<void> {
		// Ensure user skills dir exists
		if (!fsSync.existsSync(SKILLS_DIR)) {
			fsSync.mkdirSync(SKILLS_DIR, { recursive: true });
		}
		await this.loadConfig();
	}

	private async loadConfig(): Promise<void> {
		try {
			if (fsSync.existsSync(SKILLS_CONFIG)) {
				const raw = await fs.readFile(SKILLS_CONFIG, 'utf-8');
				this.config = JSON.parse(raw);
			}
		} catch {
			this.config = { disabled: [] };
		}
	}

	private async saveConfig(): Promise<void> {
		await fs.writeFile(SKILLS_CONFIG, JSON.stringify(this.config, null, 2));
	}

	/**
	 * List all available skills (default + user) with their enabled state
	 */
	async listAll(): Promise<SkillMeta[]> {
		const skills: SkillMeta[] = [];
		const seen = new Set<string>();

		// User skills first (they override defaults)
		try {
			const userFiles = await fs.readdir(SKILLS_DIR);
			for (const file of userFiles) {
				if (!file.endsWith('.js') && !file.endsWith('.mjs')) continue;
				try {
					const skillPath = path.join(SKILLS_DIR, file);
					const mod = await import(`file://${skillPath}?t=${Date.now()}`);
					if (mod.default?.name) {
						seen.add(mod.default.name);
						skills.push({
							name: mod.default.name,
							description: mod.default.description || '',
							source: 'user',
							filename: file,
							enabled: !this.config.disabled.includes(mod.default.name)
						});
					}
				} catch { /* skip broken skills */ }
			}
		} catch { /* dir read fail */ }

		// Default skills
		try {
			if (fsSync.existsSync(this.defaultSkillsDir)) {
				const defaultFiles = await fs.readdir(this.defaultSkillsDir);
				for (const file of defaultFiles) {
					if (!file.endsWith('.js') && !file.endsWith('.mjs')) continue;
					try {
						const skillPath = path.join(this.defaultSkillsDir, file);
						const mod = await import(`file://${skillPath}?t=${Date.now()}`);
						if (mod.default?.name && !seen.has(mod.default.name)) {
							skills.push({
								name: mod.default.name,
								description: mod.default.description || '',
								source: 'default',
								filename: file,
								enabled: !this.config.disabled.includes(mod.default.name)
							});
						}
					} catch { /* skip broken skills */ }
				}
			}
		} catch { /* default dir missing */ }

		return skills;
	}

	async enable(name: string): Promise<void> {
		this.config.disabled = this.config.disabled.filter(n => n !== name);
		await this.saveConfig();
		bus.emitAgent({ type: 'thought', content: `[Skills] Enabled: ${name}`, hidden: true });
	}

	async disable(name: string): Promise<void> {
		if (!this.config.disabled.includes(name)) {
			this.config.disabled.push(name);
		}
		await this.saveConfig();
		bus.emitAgent({ type: 'thought', content: `[Skills] Disabled: ${name}`, hidden: true });
	}

	async remove(name: string): Promise<boolean> {
		const all = await this.listAll();
		const skill = all.find(s => s.name === name);
		if (!skill || skill.source !== 'user') return false;

		try {
			await fs.unlink(path.join(SKILLS_DIR, skill.filename));
			// Also remove from disabled list
			this.config.disabled = this.config.disabled.filter(n => n !== name);
			await this.saveConfig();
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Install a default skill to user dir (copies it so user can customize)
	 */
	async copyToUser(name: string): Promise<boolean> {
		const all = await this.listAll();
		const skill = all.find(s => s.name === name && s.source === 'default');
		if (!skill) return false;

		try {
			const src = path.join(this.defaultSkillsDir, skill.filename);
			const dest = path.join(SKILLS_DIR, skill.filename);
			await fs.copyFile(src, dest);
			return true;
		} catch {
			return false;
		}
	}

	isDisabled(name: string): boolean {
		return this.config.disabled.includes(name);
	}
}

export const skillsManager = new SkillsManager();
