import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { config } from './config.js';
import { keyManager } from './keyManager.js';

// Schema for .obsidian/mcp.json
const MCPServerConfigSchema = z.object({
    command: z.string(),
    args: z.array(z.string()).default([]),
    env: z.record(z.string()).optional(),
    secureEnv: z.array(z.string()).optional(), // List of env vars to load from KeyManager
    autoConnect: z.boolean().default(false),
});

const MCPConfigSchema = z.object({
    servers: z.record(MCPServerConfigSchema).default({}),
});

type MCPConfig = z.infer<typeof MCPConfigSchema>;
type ServerConfig = z.infer<typeof MCPServerConfigSchema>;

interface ActiveConnection {
    client: Client;
    transport: StdioClientTransport;
    capabilities: any;
}

class MCPManager {
    private connections: Map<string, ActiveConnection> = new Map();
    private config: MCPConfig = { servers: {} };

    constructor() { }

    /**
     * Load configuration from .obsidian/mcp.json
     */
    async init() {
        try {
            const configPath = path.join(process.cwd(), '.obsidian', 'mcp.json');
            const exists = await fs.stat(configPath).then(() => true).catch(() => false);

            if (exists) {
                const content = await fs.readFile(configPath, 'utf-8');
                this.config = MCPConfigSchema.parse(JSON.parse(content));
            } else {
                // Initialize empty config if not exists
                this.config = { servers: {} };
            }

            // Auto-connect to configured servers (non-blocking)
            Object.entries(this.config.servers).forEach(([name, serverConfig]) => {
                if (serverConfig.autoConnect) {
                    this.connect(name, serverConfig).catch(err => {
                        // console.error(`Failed to auto-connect to MCP server '${name}':`, err);
                    });
                }
            });
        } catch (error) {
            console.error('Failed to initialize MCP Manager:', error);
        }
    }

    /**
     * Connect to an MCP server
     */
    async connect(name: string, serverConfig: ServerConfig) {
        if (this.connections.has(name)) {
            // console.warn(`Already connected to server '${name}'`);
            return;
        }

        try {
            // Sanitize environment variables (remove internal whitespace/newlines from copy-paste)
            const sanitizedEnv = serverConfig.env ? Object.fromEntries(
                Object.entries(serverConfig.env).map(([k, v]) => [k, v.trim()])
            ) : {};

            // Inject secure keys from KeyManager
            if (serverConfig.secureEnv) {
                for (const envName of serverConfig.secureEnv) {
                    const key = await keyManager.loadKey({ service: 'obsidian-mcp', account: envName });
                    if (key) {
                        sanitizedEnv[envName] = key;
                    } else {
                        console.warn(`[MCP] Missing secure key for ${envName} (server: ${name})`);
                    }
                }
            }

            const transport = new StdioClientTransport({
                command: serverConfig.command,
                args: serverConfig.args,
                env: sanitizedEnv,
            });

            const client = new Client(
                {
                    name: 'obsidian-next-client',
                    version: '0.4.1',
                },
                {
                    capabilities: {
                        // Client does not provide tools, it consumes them
                    },
                }
            );

            const connectTimeout = 10000;
            await Promise.race([
                client.connect(transport),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), connectTimeout))
            ]);

            this.connections.set(name, {
                client,
                transport,
                capabilities: client.getServerCapabilities(),
            });

            // Persist the fact that we are now connected
            if (this.config.servers[name] && !this.config.servers[name].autoConnect) {
                this.config.servers[name].autoConnect = true;
                await this.saveConfig();
            }

            // console.log(`Connected to MCP server: ${name}`);
        } catch (error) {
            throw new Error(`Failed to connect to ${name}: ${error}`);
        }
    }

    /**
     * Add and connect to a new server, then persist config
     * Set skipConnect to true if the server requires manual config (API keys) before it can start
     */
    async addServer(name: string, serverConfig: ServerConfig, skipConnect = false) {
        if (this.config.servers[name]) {
            throw new Error(`Server '${name}' already exists`);
        }

        this.config.servers[name] = serverConfig;

        try {
            if (!skipConnect) {
                await this.connect(name, serverConfig);
            }
            await this.saveConfig();
        } catch (error) {
            // Rollback if connection fails
            delete this.config.servers[name];
            throw error;
        }
    }

    /**
     * Remove a server and persist config
     */
    async removeServer(name: string) {
        if (!this.config.servers[name]) {
            throw new Error(`Server '${name}' not found`);
        }

        await this.disconnect(name);
        delete this.config.servers[name];
        await this.saveConfig();
    }

    /**
     * Update an existing server configuration and persist
     */
    async updateServer(name: string, updates: Partial<ServerConfig>) {
        const existing = this.config.servers[name];
        if (!existing) {
            throw new Error(`Server '${name}' not found`);
        }

        // Merge updates
        this.config.servers[name] = {
            ...existing,
            ...updates,
            env: {
                ...(existing.env || {}),
                ...(updates.env || {}),
            }
        };

        await this.saveConfig();

        // If connected, reconnect to apply changes
        if (this.connections.has(name)) {
            await this.disconnect(name);
            await this.connect(name, this.config.servers[name]);
        }
    }

    /**
     * Persist current config to disk
     */
    private async saveConfig() {
        const configPath = path.join(process.cwd(), '.obsidian', 'mcp.json');
        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await fs.writeFile(configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    }

    /**
     * Disconnect from a server
     */
    async disconnect(name: string) {
        const conn = this.connections.get(name);
        if (conn) {
            try {
                // Add a timeout to prevent hanging the UI if the server is unresponsive
                const disconnectTimeout = 2000;
                await Promise.race([
                    conn.client.close(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Disconnect timeout')), disconnectTimeout))
                ]);
            } catch (error) {
                console.warn(`Disconnect from ${name} timed out or failed:`, error);
            } finally {
                // Attempt to force kill the process if we can access it via the transport
                try {
                    const transport = conn.transport as any;
                    if (transport._process && typeof transport._process.kill === 'function') {
                        transport._process.kill('SIGKILL');
                    }
                } catch (e) {
                    // Ignore errors during forced kill
                }

                this.connections.delete(name);

                // Persist the fact that we are now disconnected
                if (this.config.servers[name] && this.config.servers[name].autoConnect) {
                    this.config.servers[name].autoConnect = false;
                    await this.saveConfig();
                }

                // console.log(`Disconnected from MCP server: ${name}`);
            }
        }
    }

    /**
     * List all tools from all connected servers
     */
    async listTools() {
        const allTools: any[] = [];

        for (const [serverName, conn] of this.connections) {
            try {
                // Create a timeout promise
                const timeoutMs = 5000;
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout listing tools')), timeoutMs)
                );

                // Race the tool listing against the timeout
                const result: any = await Promise.race([
                    conn.client.request(
                        { method: 'tools/list' }, // Raw request or use helper if available
                        ListToolsResultSchema
                    ),
                    timeoutPromise
                ]);

                if (result && result.tools) {
                    // Namespace tools to avoid collisions? e.g. "filesystem_list"
                    // Or keep original names. Let's keep original for now but add meta.
                    const serverTools = result.tools.map((t: any) => ({
                        ...t,
                        server: serverName, // Attach server name for routing
                        // If we wanted to rename: name: `${serverName}__${t.name}`
                    }));
                    allTools.push(...serverTools);
                }
            } catch (error) {
                console.error(`Failed to list tools from ${serverName}:`, error);
            }
        }

        return allTools;
    }

    /**
     * Call a specific tool on a server
     */
    async callTool(serverName: string, toolName: string, args: any) {
        const conn = this.connections.get(serverName);
        if (!conn) {
            throw new Error(`Server '${serverName}' not connected.`);
        }

        try {
            const result = await conn.client.request(
                {
                    method: 'tools/call',
                    params: {
                        name: toolName,
                        arguments: args,
                    },
                },
                CallToolResultSchema
            );

            return result;
        } catch (error) {
            throw new Error(`Tool execution failed on ${serverName}/${toolName}: ${error}`);
        }
    }

    /**
     * Get active connections status
     */
    getStatus() {
        return Object.keys(this.config.servers).map(name => ({
            name,
            config: this.config.servers[name],
            connected: this.connections.has(name),
            capabilities: this.connections.get(name)?.capabilities
        }));
    }
}

export const mcp = new MCPManager();
