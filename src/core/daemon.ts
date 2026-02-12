import net from 'net';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { bus } from './bus.js';
import { agent } from './agent.js';
import { config } from './config.js';
import { telegramGateway } from './telegram.js';
import { AgentEvent, UserEvent } from '../events/types.js';
import { fileURLToPath } from 'url';

const SOCKET_DIR = path.join(os.homedir(), '.obsidian-next');
const SOCKET_PATH = path.join(SOCKET_DIR, 'daemon.sock');

export class Daemon {
	private server: net.Server | null = null;
	private connections = new Set<net.Socket>();

	constructor() {}

	async start() {
		if (!fs.existsSync(SOCKET_DIR)) {
			fs.mkdirSync(SOCKET_DIR, { recursive: true });
		}

		// Cleanup old socket if it exists
		if (fs.existsSync(SOCKET_PATH)) {
			try {
				fs.unlinkSync(SOCKET_PATH);
			} catch (e) {
				// Ignore errors if socket is in use or doesn't exist
			}
		}

		// Initialize agent
		await agent.init();

		// Initialize Telegram Gateway
		await telegramGateway.init();

		this.server = net.createServer((socket) => {
			this.handleConnection(socket);
		});

		this.server.listen(SOCKET_PATH, () => {
			bus.emitAgent({
				type: 'thought',
				content: `[Daemon] Service active at ${SOCKET_PATH}`
			});
		});

		// Bridge local bus -> sockets
		bus.on('agent', (event: AgentEvent) => {
			this.broadcast(event);
		});

		// Handle process termination
		process.on('SIGINT', () => this.stop());
		process.on('SIGTERM', () => this.stop());
	}

	async setupService(): Promise<{
		success: boolean;
		path: string;
		error?: string;
	}> {
		const platform = os.platform();
		const home = os.homedir();

		// Get absolute path to the obsidian binary/index.js
		const currentFile = fileURLToPath(import.meta.url);
		const projectRoot = path.resolve(path.dirname(currentFile), '..', '..');
		const entryPoint = path.join(projectRoot, 'dist', 'index.js');
		const nodeBinary = process.execPath;

		if (platform === 'darwin') {
			const plistDir = path.join(home, 'Library', 'LaunchAgents');
			const plistPath = path.join(plistDir, 'com.obsidian.daemon.plist');
			const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.obsidian.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodeBinary}</string>
        <string>${entryPoint}</string>
        <string>--daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${path.join(SOCKET_DIR, 'daemon.log')}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(SOCKET_DIR, 'daemon.err.log')}</string>
</dict>
</plist>`;

			try {
				if (!fs.existsSync(plistDir))
					fs.mkdirSync(plistDir, { recursive: true });
				fs.writeFileSync(plistPath, plistContent);
				return { success: true, path: plistPath };
			} catch (e: any) {
				return { success: false, path: plistPath, error: e.message };
			}
		} else if (platform === 'linux') {
			const systemdDir = path.join(home, '.config', 'systemd', 'user');
			const servicePath = path.join(systemdDir, 'obsidian.service');
			const serviceContent = `[Unit]
Description=Obsidian Autonomous Agent Daemon
After=network.target

[Service]
ExecStart=${nodeBinary} ${entryPoint} --daemon
Restart=always
RestartSec=10
StandardOutput=append:${path.join(SOCKET_DIR, 'daemon.log')}
StandardError=append:${path.join(SOCKET_DIR, 'daemon.err.log')}

[Install]
WantedBy=default.target`;

			try {
				if (!fs.existsSync(systemdDir))
					fs.mkdirSync(systemdDir, { recursive: true });
				fs.writeFileSync(servicePath, serviceContent);
				return { success: true, path: servicePath };
			} catch (e: any) {
				return { success: false, path: servicePath, error: e.message };
			}
		}

		return {
			success: false,
			path: '',
			error: `Unsupported platform: ${platform}`
		};
	}

	private handleConnection(socket: net.Socket) {
		this.connections.add(socket);

		// Send a greeting/status
		socket.write(
			JSON.stringify({ type: 'connected', timestamp: Date.now() }) + '\n'
		);

		let buffer = '';
		socket.on('data', (data) => {
			buffer += data.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				try {
					const event = JSON.parse(line) as UserEvent;
					bus.emitUser(event);
				} catch (e) {
					console.error('[Daemon] Failed to parse socket message:', e);
				}
			}
		});

		socket.on('close', () => {
			this.connections.delete(socket);
		});

		socket.on('error', (err) => {
			console.error('[Daemon] Socket error:', err);
			this.connections.delete(socket);
		});
	}

	private broadcast(event: AgentEvent) {
		const payload = JSON.stringify(event) + '\n';
		for (const socket of this.connections) {
			socket.write(payload);
		}
	}

	async stop() {
		if (this.server) {
			this.server.close();
		}
		await telegramGateway.stop();
		if (fs.existsSync(SOCKET_PATH)) {
			fs.unlinkSync(SOCKET_PATH);
		}
		process.exit(0);
	}
}

export const daemon = new Daemon();
