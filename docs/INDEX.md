# Documentation Directory

Welcome to the comprehensive documentation for **Obsidian Next**.

> Version: 0.4.6 | Updated: 2026-02-07

---

## Getting Started

- **[Installation & Setup](../README.md#installation)**: Getting started guide (in root).
- **[Troubleshooting](TROUBLESHOOTING.md)**: Common issues and solutions.

## Architecture & Design

- **[Architecture](ARCHITECTURE.md)**: Deep dive into the Always-On Daemon, Supervisor-Agent topology, and Event Bus.
- **[Agent Logic](AGENT_ARCHITECTURE.md)**: Understanding Adaptive Reasoning (Claude 4.6), Modes (Auto/Plan/Safe), and the Execution Loop.
- **[Smart Context & Memory](CONTEXT.md)**: Deep dive into 1M context, semantic memory (sqlite-vec), and bidirectional Markdown sync.
- **[CLI Design System](CLI_DESIGN_SYSTEM.md)**: Visual standards, symbols, and UI component reference.

## Tooling & Safety

- **[Tools Reference](TOOLS.md)**: Detailed API reference for the built-in tools and self-improving skill creation.
- **[Sandboxing](SANDBOX.md)**: How to configure and verify OS-level isolation.
- **[Security Policy](SECURITY.md)**: Threat model, security features, and vulnerability disclosure.

## Session & Agent Management

Obsidian Next operates as a global, system-wide daemon with persistent memory:

| Command | Description |
|---------|-------------|
| `/init` | Interactive setup (API key, service initialization) |
| `/schedule`| Schedule background tasks (proactive heartbeat) |
| `/memory` | Manage semantic memory and export to `MEMORY.md` |
| `/status` | Daemon health check and workspace status |
| `/exit` | Stop the daemon or exit the current CLI view |
| `/resume` | List/restore saved sessions across workspaces |

Global state is stored in `~/.obsidian-next/` and preserves context, history, tasks, and cost tracking across all your projects.

## Planning & Development

- **[Master Plan](MASTER_PLAN.md)**: The "Final" architectural blueprint for the autonomous restructure.
- **[Product Requirements (PRD)](PRD.md)**: Approved specification for core functionality.
- **[Roadmap](ROADMAP.md)**: Development roadmap and planned features.
- **[Git Workflow](GIT_WORKFLOW.md)**: Contribution guidelines and branch conventions.

## MCP Integration

- **[MCP User Guide](MCP_USER_GUIDE.md)**: Setting up Model Context Protocol servers.
