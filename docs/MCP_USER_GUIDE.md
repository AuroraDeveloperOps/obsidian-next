# Model Context Protocol (MCP) Ecosystem Guide

## 1. Overview
The **MCP Ecosystem** in Obsidian Next transforms the CLI from a static tool into a dynamic, extensible platform. It allows the AI Agent to connect to external data sources (Filesystems, Git, Databases, Web) via the [Model Context Protocol](https://modelcontextprotocol.io/).

**Key capabilities:**
- **Dynamic Tooling:** The Agent can "learn" new tools at runtime.
- **Tool Namespacing:** To avoid collisions, tools are prefixed by their server name (e.g., `filesystem_read_file`).
- **Auto-Discovery:** The Agent knows about a "Registry" of certified servers.
- **Self-Management:** The Agent can install its own dependencies if a task requires them.

## 2. The UX Experience

### A. The Interactive TUI (`/mcp`)
For users who prefer manual control, the **MCP Manager** provides a visual interface.
- **Command**: Type `/mcp` in the chat.
- **Visuals**: See a live list of configured servers and their connection status (`[Online]`/`[Offline]`).
- **Controls**:
    - `a`: **Add** a new server manually (Command + Args).
    - `e`: **Edit** environment variables (e.g., API Keys).
    - `i`: **Store** - Access the Certified Server Store.
    - `c`: **Connect** to a server.
    - `d`: **Disconnect** from a server.
    - `r`: **Remove** a server configuration.

### C. The Setup Flow ("Zero-Config")
When you install a "Certified" server that requires an API key (like `context7` or `research`), the TUI will automatically jump to a **Setup** screen. 
1.  **Install**: Press `Enter` in the Store.
2.  **Setup**: The TUI prompts: `CONTEXT7_API_KEY: `.
3.  **Active**: Type your key (it will be securely masked as `******`), hit `Enter`, and you're ready to connect!
    > **Note**: Your key is securely stored in `mcp.json` and redacted from logs.

### B. The Agentic Flow ("Natural Language")
This is the true power of the ecosystem. You don't need to manage servers yourself.
**User**: "I need to research the latest Next.js 15 routing changes. Plan this out."
**Agent**: 
1.  *Thinking*: "I don't have web search capabilities active."
2.  *Thinking*: "Checking Registry... Found 'research' server."
3.  **Action**: `mcp_manage install 'research'`
4.  *System*: Installs `@modelcontextprotocol/server-brave-search`.
5.  **Action**: `brave_search("Next.js 15 routing")`
6.  **Result**: Agent answers your question using fresh data.

## 3. Core Architecture

### 1. Manager (`src/core/mcp.ts`)
The central brain that:
- Manages the persistence file: `.obsidian/mcp.json`.
- Handles connection lifecycles (stdio transport).
- Proxies tool execution requests to the appropriate server.
- **Safety**: Enforces connection timeouts (5s) to prevent UI freezes if a server hangs.

### 2. Registry (`src/core/mcp-registry.ts`)
A certified catalog of known-good servers.
- **filesystem**: Access full disk (`/`).
- **research**: Web search via Brave.
- **git**: Advanced repository management.
- **context7**: Official documentation retrieval.

### 3. Agent Integration
- **3-Tier Capability Discovery**:
  1.  **Active**: Tools currently connected and ready to use.
  2.  **Offline**: Configured but disconnected servers (Agent can `connect` on demand).
  3.  **Installable**: Known registry servers (Agent can `install` on demand).
- **System Prompt**: Dynamically updated to reflect these tiers.
- **Tooling**: `mcp_manage` tool allows `add`, `remove`, `connect`, `disconnect`, and `install`.

## 4. Setup & Configuration

### Prerequisites
- Node.js & NPM installed.
- For `research` MCP: Get a Brave Search API Key (free tier available).

### Configuration File
Your connections are saved in `.obsidian/mcp.json`:
```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/users/me/projects"]
    }
  }
}
```
*Note: You rarely need to edit this manually. Use `/mcp` or let the Agent do it.*

## 5. Security Model
- **Sandboxing**: MCP servers run as separate processes.
- **Permissions**: The Agent must still ask for permission to execute `mcp_manage` actions (unless in Auto-Mode).
- **Visibility**: All MCP tool executions are logged to the `auditLog` and visible in the UI.
