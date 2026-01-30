# Obsidian Next

![Obsidian Next](assets/obsidianboxes.png)

![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-yellow.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Status](https://img.shields.io/badge/Status-Active_Development-green)

**Obsidian Next** is a professional, structured, and secure AI agent interface for the terminal. Built with a "Structure-First" architecture for rigorous, interactive, and safe user experiences.

---

## Why Obsidian Next?

**Safer than "Whatever-Bot"**

Most AI coding assistants stream raw text and execute code blindly. Obsidian Next takes a different approach:

1.  **Structure Over Slop**: We don't stream raw Markdown. Agents emit **Typed JSON Events**, ensuring the UI is always in sync with the logic.
2.  **The Auditor**: A built-in security layer that pre-flights every tool call. It catches dangerous commands *before* they run.
3.  **Zero Hallucinated Ops**: Tools are strictly typed. If the Agent tries to call `deleteFile` (which doesn't exist), the system rejects it instantly.
4.  **Sandbox Runtime**: Supports OS-level isolation via `@anthropic-ai/sandbox-runtime`, with native fallbacks to `sandbox-exec` (macOS) and `firejail` (Linux).

## Workspace & Evaluation

The `workspace/` directory is a dedicated environment where **Polyoxy** is currently evaluating Obsidian Next.

- **Status**: Internal Evaluation / Pre-release.
- **Benchmarks**: Comprehensive safety and performance benchmarks are running. Results will be published soon.
- **Security**: This environment implements an **Apple Keychain-like Rotating Variable System**. This mechanism rotates API keys and sensitive environment variables automatically, ensuring maximum security during long-running agent sessions.

## Documentation Directory

Fully detailed documentation is available in the **[docs/](docs/README.md)** directory:

- **[Architecture](docs/ARCHITECTURE.md)**: Supervisor-Agent Topology & Event Bus.
- **[Agent Logic](docs/AGENT_ARCHITECTURE.md)**: Planning, Modes, and Execution.
- **[Tools & Safety](docs/TOOLS.md)**: Reference for the 8 core tools and limits.
- **[Design System](docs/CLI_DESIGN_SYSTEM.md)**: Visual guide to the terminal UI.
- **[Sandboxing](docs/SANDBOX.md)**: Configuration for secure execution.

---

## Quick Start

### Prerequisites
- Node.js v20+

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/obsidian-next.git
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
# Set your API Key
export ANTHROPIC_API_KEY="sk-ant-..."

# Start the Agent
npm start
```

## References & Standards

This project adheres to strict industry standards:

- **[Keep a Changelog](https://keepachangelog.com/)**: Standardized formatting for version history.
- **[Semantic Versioning](https://semver.org/)**: Predictable versioning.
- **[Model Context Protocol](https://modelcontextprotocol.io/)**: Open standard for AI context exchange.
- **[Anthropic Sandbox](https://github.com/anthropic-ai/sandbox-runtime)**: Secure runtime isolation.

## Contributing

We strictly enforce **Conventional Commits** and professional standards (no emojis in code).
See **[CONTRIBUTING.md](CONTRIBUTING.md)** for branch naming conventions (`username-feature/description`).

## License

Apache License 2.0 - See [LICENSE](LICENSE) for details.
