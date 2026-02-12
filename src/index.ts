#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Root } from './ui/Root.js';
import { supervisor } from './agents/supervisor.js';
import { agent } from './core/agent.js';
import { daemon } from './core/daemon.js';
import net from 'net';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { bus } from './core/bus.js';

const SOCKET_PATH = path.join(os.homedir(), '.obsidian-next', 'daemon.sock');

async function main() {
	const args = process.argv.slice(2);

	// 1. Check for Daemon Mode
	if (args.includes('--daemon')) {
		console.log('Starting Obsidian Daemon...');
		await daemon.start();
		return;
	}

	// 2. Check for Service Init (generates launchd/systemd service file)
	if (args.includes('--service')) {
		const result = await daemon.setupService();
		if (result.success) {
			console.log(`Service installed at: ${result.path}`);
			console.log('Start with: obsidian --daemon');
		} else {
			console.error(`Service setup failed: ${result.error}`);
		}
		return;
	}

	// 3. Client Mode (Interactive UI)
	// Try to connect to daemon
	const isDaemonRunning = fs.existsSync(SOCKET_PATH);

	if (isDaemonRunning) {
		await startClient(SOCKET_PATH);
	} else {
		// Fallback to local mode (legacy)
		await startLocal();
	}
}

async function startClient(socketPath: string) {
	const socket = net.createConnection(socketPath);

	socket.on('connect', () => {
		// Bridge Socket -> Bus
		let buffer = '';
		socket.on('data', (data) => {
			buffer += data.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';
			for (const line of lines) {
				try {
					const event = JSON.parse(line);
					bus.emit('agent', event);
				} catch {}
			}
		});

		// Bridge Bus -> Socket
		bus.on('user', (event) => {
			socket.write(JSON.stringify(event) + '\n');
		});

		renderUI();
	});

	socket.on('error', (err) => {
		console.error('Failed to connect to daemon:', err.message);
		process.exit(1);
	});
}

async function startLocal() {
	// Legacy behavior: run everything in one process
	await agent.init();
	renderUI();
}

function renderUI() {
	process.stdout.write('\x1b[?1049h'); // Enable alternate screen buffer (prevents scrollback)
	process.stdout.write('\x1b[2J'); // Clear Screen
	process.stdout.write('\x1b[H'); // Move cursor to top-left

	const { waitUntilExit } = render(React.createElement(Root), {
		patchConsole: false,
		exitOnCtrlC: false
	});

	waitUntilExit()
		.then(() => {
			process.stdout.write('\x1b[?1049l'); // Restore normal screen buffer
			process.exit(0);
		})
		.catch((err) => {
			console.error('Runtime Error:', err);
			process.exit(1);
		});
}

// Ensure supervisor is initialized
if (!supervisor) {
	console.error('Fatal: Supervisor failed to initialize');
	process.exit(1);
}

main().catch((err) => {
	console.error('Fatal Error:', err);
	process.exit(1);
});
