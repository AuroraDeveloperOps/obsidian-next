# Documentation Directory

Welcome to the comprehensive documentation for **Obsidian Next**.

## Core Guides

- **[Installation & Setup](../README.md#installation)**: Getting started guide (in root).
- **[Architecture](ARCHITECTURE.md)**: Deep dive into the Supervisor-Agent topology, Event Bus, and Directory Structure.
- **[Agent Logic](AGENT_ARCHITECTURE.md)**: Understanding Modes (Auto/Plan/Safe) and the Execution Loop.
- **[CLI Design System](CLI_DESIGN_SYSTEM.md)**: Visual standards, symbols, and UI component reference.

## Tooling & Safety

- **[Tools Reference](TOOLS.md)**: Detailed API reference for the 8 built-in tools (`bash`, `read`, `edit`, etc.) and their safety limits.
- **[Sandboxing](SANDBOX.md)**: How to configure and verify OS-level isolation (`@anthropic-ai/sandbox-runtime`).

## Session Management

Obsidian Next supports persistent sessions for long-running tasks:

| Command | Description |
|---------|-------------|
| `/init` | Interactive setup (API key, model selection) |
| `/exit` | Save session and exit gracefully |
| `/resume` | List/restore saved sessions |
| `/diff` | View file change history |

Sessions are stored in `.obsidian/sessions/` and preserve context, history, tasks, and cost tracking.

## Product Specs

- **[Product Requirements (PRD)](PRD.md)**: The "Final" approved specification for Obsidian Next functionality.
