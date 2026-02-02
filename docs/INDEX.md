# Documentation Directory

Welcome to the comprehensive documentation for **Obsidian Next**.

> Version: 0.4.5 | Updated: 2026-02-02

---

## Getting Started

- **[Installation & Setup](../README.md#installation)**: Getting started guide (in root).
- **[Troubleshooting](TROUBLESHOOTING.md)**: Common issues and solutions.

## Architecture & Design

- **[Architecture](ARCHITECTURE.md)**: Deep dive into the Supervisor-Agent topology, Event Bus, and Directory Structure.
- **[Agent Logic](AGENT_ARCHITECTURE.md)**: Understanding Modes (Auto/Plan/Safe) and the Execution Loop.
- **[CLI Design System](CLI_DESIGN_SYSTEM.md)**: Visual standards, symbols, and UI component reference.
- **[Smart Context](CONTEXT.md)**: Deep dive into 100x context, summarization logic, and memory architecture.

## Tooling & Safety

- **[Tools Reference](TOOLS.md)**: Detailed API reference for the 8 built-in tools (`bash`, `read`, `edit`, etc.) and their safety limits.
- **[Sandboxing](SANDBOX.md)**: How to configure and verify OS-level isolation (`@anthropic-ai/sandbox-runtime`).
- **[Security Policy](SECURITY.md)**: Threat model, security features, and vulnerability disclosure.

## Session Management

Obsidian Next supports persistent sessions for long-running tasks:

| Command | Description |
|---------|-------------|
| `/init` | Interactive setup (API key, model selection) |
| `/exit` | Save session and exit gracefully |
| `/resume` | List/restore saved sessions |
| `/diff` | View file change history |
| `/context` | View context window usage |
| `/status` | System health check |

Sessions are stored in `.obsidian/state.db` and preserve context, history, tasks, and cost tracking.

## Planning & Development

- **[Product Requirements (PRD)](PRD.md)**: The "Final" approved specification for Obsidian Next functionality.
- **[Roadmap](ROADMAP.md)**: Development roadmap and planned features.
- **[Improvement Plan](IMPROVEMENT_PLAN.md)**: Technical analysis and enhancement proposals.
- **[Git Workflow](GIT_WORKFLOW.md)**: Contribution guidelines and branch conventions.

## MCP Integration

- **[MCP User Guide](MCP_USER_GUIDE.md)**: Setting up Model Context Protocol servers.
