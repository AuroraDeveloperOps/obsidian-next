# Obsidian Next

![Obsidian Next](assets/obsidianboxes.png)

![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-yellow.svg)
![npm version](https://img.shields.io/npm/v/@aurora-foundation/obsidian-next.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Release](https://img.shields.io/badge/Release-v0.4.2-blue)
![Status](https://img.shields.io/badge/Status-Stable-green)

**Obsidian Next** is a professional, structure-first AI agent interface for the terminal. Built by **Aurora Labs** to provide a rigorous, secure, and interactive environment for modern AI engineering.

> [!WARNING]
> **Active Development**
> This project is currently **Stable (v0.4.2 Release Candidate)**. Core architecture is frozen and audits are complete. Please report any edge-case issues to the issue tracker.

---

## Quick Start (npm)

Get the latest stable release (v0.4.2) directly from npm:

```bash
# Install globally
npm install -g @aurora-foundation/obsidian-next

# Launch the interface
obsidian
```

---

## How it Works

Obsidian Next is not just a chat interface; it's a **Command Center** for AI automation.

### 1. The Structure-First Engine
Unlike raw streaming bots, Obsidian emits **Typed JSON Events**. This prevents "Markdown Slop" and ensures the UI remains perfectly synchronized with the agent's internal reasoning.

### 2. The Auditor (Safe-by-Default)
Every tool call (Bash, Write, MCP) is pre-flighted by the **Auditor**. It checks permissions and catches dangerous operations *before* they touch your filesystem.

### 3. MCP-Native Ecosystem
Full integration with the **Model Context Protocol**. Obsidian can dynamically connect to external tools, databases, and APIs while maintaining local-first security.

---

## Security Features (v0.4.2)

Obsidian Next implements **Zero Trust AI Automation** with the following security layers:

### Implemented (v0.4.2-security)

1.  **MCP Secure Injection** [NEW]
    - **Keychain Integration**: MCP API keys migrated from plaintext to System Keychain
    - **Secure Runtime Injection**: Keys injected via `secureEnv` only during active server connection
    - **Multi-Account Support**: Scoped keys per service/account

2.  **Local-First Architecture** [NEW]
    - **Database Removal**: Eliminated external databases (Postgres/Redis) from attack surface
    - **In-Memory Undo**: Sensitive history kept in RAM, not persisted to disk

3.  **Rotating Key System**
    - Secure API key storage via macOS Keychain, Linux secret-tool, or encrypted file fallback
    - Machine-specific key derivation (AES-256-GCM)
    - Auto-rotation detection for long sessions
    - Never stores plaintext keys in config files

4.  **PII Redaction Engine**
    - Real-time redaction of sensitive data before sending to LLM
    - 14 built-in patterns: email, phone, SSN, credit cards, AWS keys, API tokens, passwords, private keys, JWT
    - Configurable per-pattern enable/disable
    - Allowlist support for specific values

5.  **Audit Logging**
    - Complete audit trail of all command executions
    - File operation logging (read/write/edit/delete)
    - Approval decision tracking
    - JSON format for easy parsing, auto-rotation at 10MB

6.  **Approval Enforcement**
    - Commands requiring approval now properly block execution
    - Safe mode enforces approval for all write operations
    - No bypass possible through mode switching

7.  **Sandbox Runtime**
    - OS-level isolation via `@anthropic-ai/sandbox-runtime`
    - Native fallbacks to `sandbox-exec` (macOS) and `firejail` (Linux)

### Roadmap

1.  **MCP & Plugin Ecosystem (Phase v0.5.x) [ACTIVE]**:
    - **READY**: System stability verified. Now entering MCP implementation phase.
    - **MCP Manager**: Core module for managing Model Context Protocol connections.
    - **Commands**: `/mcp` for connection management and `/plugin` for extending functionality.
    - **UI**: Interactive `MCPMenu` component for easy configuration.
    - **Registry**: Preconfigured registry of useful MCP servers.
    - **AI Integration**: Updated system prompts to leverage MCP capabilities.

2.  **Quality Assurance**:
    - **"Hella Testings"**: Comprehensive test coverage across all modules (Unit, Integration, E2E).

3.  **Hardware-Level Sandboxing**:
    - Integration with native OS hypervisors (Apple Virtualization Framework) for true VM isolation.

4.  **Network Isolation**:
    - Per-session network namespaces for complete network control.

## Documentation Directory

Fully detailed documentation is available in the **[docs/](docs/README.md)** directory:

- **[MCP Ecosystem](docs/MCP_USER_GUIDE.md)**: Full guide to Model Context Protocol features. [NEW]
- **[Architecture](docs/ARCHITECTURE.md)**: Supervisor-Agent Topology & Event Bus.
- **[Agent Logic](docs/AGENT_ARCHITECTURE.md)**: Planning, Modes, and Execution.
- **[Tools & Safety](docs/TOOLS.md)**: Reference for the 8 core tools and limits.
- **[Design System](docs/CLI_DESIGN_SYSTEM.md)**: Visual guide to the terminal UI.
- **[Sandboxing](docs/SANDBOX.md)**: Configuration for secure execution.
- **[Git Workflow](docs/GIT_WORKFLOW.md)**: Versioning and contribution standards. [NEW]

---

## Installation

### Primary Method (NPM)

**Latest development build direct from Aurora Labs.**
Recommended for quick evaluation only.

```bash
npm install -g @aurora-foundation/obsidian-next
```

Or run it instantly without installation using `npx`:

```bash
npx @aurora-foundation/obsidian-next
```

> [!IMPORTANT]
> **Privacy & Open Source Priority**
> We prioritize private, local execution and open-source security. For high-security environments, we strongly recommend the **Development Setup** (cloning and building locally) to ensure a 100% private, audited solution. The NPM installation is provided as an "easy setup" but is not the recommended path for production or sensitive deployments.

### Development Setup (From Source)

For contributors or those who want to run the latest development build:

```bash
# 1. Clone the repository
git clone https://github.com/auroradeveloperops/obsidian-next.git
cd obsidian-next

# 2. Install dependencies
npm install

# 3. Build
npm run build
```

### MCP Setup (Experimental)

Obsidian Next can be run as a Model Context Protocol (MCP) server.

1.  Copy the example config:
    ```bash
    cp mcp-config.example.json mcp-config.json
    ```
2.  Configure your client (e.g., Claude Desktop) to point to the server.

### Usage

```bash
# Initialize (stores API key securely, selects model)
npm start
/init

# Interrupt Generation
# Press 'Escape' at any time to stop the agent's thought process or tool execution.

# Or set API key via environment
export ANTHROPIC_API_KEY="sk-ant-..."
npm start
```

### Commands

| Command | Description |
|---------|-------------|
| `/init` | Initialize configuration with interactive setup |
| `/settings` | Interactive settings menu (arrow keys + Enter) |
| `/mode` | Set execution mode (auto/plan/safe) |
| `Esc` | **Interrupt** current agent action immediately |
| `/models` | Select AI model |
| `/status` | Show system status |
| `/cost` | Show session cost |
| `/undo` | Undo file changes |
| `/diff` | View recent file changes with line-level diffs |
| `/sandbox` | Toggle sandbox mode |
| `/clear` | Clear conversation (Prompted) |
| `/doctor` | Run diagnostics |
| `/resume` | Restore a saved session |
| `/exit` | Save session and exit (Prompted) |

### Settings Menu

Access the interactive settings menu with `/settings`:

```
[ Settings ]      Mode: SAFE

> Execution Mode          Current: safe
  Security                PII, audit, sandbox
  UI Preferences          Syntax, colors
  Permissions             Allow/deny lists
  Commands                Quick access
  Close Settings

Arrows: navigate | Enter: select | Esc: back | Shift+Tab: cycle mode
```

### Security Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `security.piiRedaction` | `true` | Redact PII before sending to LLM |
| `security.auditLogging` | `true` | Log all commands to audit.log |
| `security.keyBackend` | `auto` | Key storage: auto/keychain/secret-tool/encrypted-file |

### Execution Modes

| Mode | Description |
|------|-------------|
| `safe` | (Default) Require approval for all write operations |
| `plan` | Read-only planning, approve plan before execution |
| `auto` | Execute all commands without confirmation |

### Session Management

Obsidian Next supports persistent sessions for long-running tasks:

| Command | Description |
|---------|-------------|
| `npm start` | **Fresh Start**. Archives old tasks to `.obsidian/archive` and starts clean. |
| `/resume` | List and restore a saved session (keeping context & tasks). |
| `/resume --last` | Quickly restore the most recent session. |
| `/exit` | Save session state and exit gracefully. |

> [!NOTE]
> **Fresh Session = Fresh State**. Running `npm start` creates a blank slate to prevent "zombie tasks" from confusing the agent. Use `/resume` if you want to continue where you left off.

## References & Standards

This project adheres to strict industry standards:

- **[Keep a Changelog](https://keepachangelog.com/)**: Standardized formatting for version history.
- **[Semantic Versioning](https://semver.org/)**: Predictable versioning.
- **[Model Context Protocol](https://modelcontextprotocol.io/)**: Open standard for AI context exchange.
- **[Anthropic Sandbox](https://github.com/anthropic-ai/sandbox-runtime)**: Secure runtime isolation.

## Contributing

We strictly enforce **Conventional Commits** and professional standards (no emojis in code).
See **[CONTRIBUTING.md](CONTRIBUTING.md)** for branch naming conventions (`username-feature/description`).

## Team

**Obsidian Next** is maintained by **Aurora Labs**, the applied research division of the **Aurora Foundation**. We focus on building the next generation of zero-trust AI infrastructure, including strictly typed agent topologies and secure cognitive architectures.

---

## License

Apache License 2.0 - See [LICENSE](LICENSE) for details.
