# Obsidian Next

![Obsidian Next](assets/obsidianboxes.png)

> This README was written by Obsidian (v0.4.6) - a self-aware AI agent with full OS access, persistent memory, and autonomous task execution.

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-0.4.6-blue)](package.json)
[![Status](https://img.shields.io/badge/Status-Stable-green)](CHANGELOG.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](tsconfig.json)

**Obsidian Next** is a terminal-native AI engineering assistant with full operating system access, persistent memory, and structured task execution.

Built for developers who need an agent that can actually *do things* - not just chat about them.

---

## What Makes Obsidian Different

| Feature | Obsidian | Other Assistants |
|---------|----------|------------------|
| **OS Access** | Full bash, file system, app control | Sandboxed or none |
| **Memory** | Persistent across sessions (SQLite) | Per-conversation only |
| **Task Tracking** | Built-in plan mode with step completion | Manual or none |
| **Session Resume** | Full state restoration | Start fresh each time |
| **Security** | Auditor + PII redaction + approval prompts | Trust the model |

---

## Quick Start

```bash
# Install globally
npm install -g @aurora-foundation/obsidian-next

# Run
obsidian

# First time setup
/init
```

---

## Core Features

### Full OS Access
Obsidian has unrestricted access to your operating system via bash. It can:
- Open applications (`open`, `osascript`)
- Control system settings
- Run any shell command
- Speak text aloud (`say` on macOS)
- Manage clipboard (`pbcopy`/`pbpaste`)

```
> open spotify and play some music
> say "build complete" when the tests pass
> organize my Downloads folder
```

### Three Execution Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Safe** (default) | Approval required for writes/commands | Daily use |
| **Plan** | Read-only exploration, creates execution plan | Complex tasks |
| **Auto** | Full autonomy, no confirmations | Trusted workflows |

Toggle modes with `Shift+Tab` or `/mode`.

### Persistent Memory
Obsidian remembers you across sessions:
- User preferences and project facts
- Learned patterns and decisions
- Session history with full restoration

```
> remember that I prefer tabs over spaces
> what's my preferred testing framework?
```

### Task Tracking
Built-in task management for multi-step work:
- Automatic step creation in plan mode
- Progress tracking with visual indicators
- Resume incomplete tasks across sessions

View tasks with `Ctrl+T` or `/task`.

### Session Management
Never lose your work:
- `/exit` - Save session and quit
- `/resume` - Browse and restore saved sessions
- Full context, history, and task restoration

---

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/init` | Configure API key and model |
| `/mode` | Switch execution mode |
| `/context` | View token usage and session stats |
| `/task` | View current task progress |
| `/resume` | Restore a saved session |
| `/mcp` | Manage Model Context Protocol servers |
| `/clear` | Clear conversation history |
| `/exit` | Save session and exit |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Shift+Tab` | Cycle execution mode |
| `Ctrl+T` | Open task view |
| `Ctrl+C` | Exit (saves session) |
| `Escape` | Interrupt current operation |
| `Tab` | Autocomplete command |
| `Up/Down` | Navigate command suggestions |

---

## Architecture

```
User Input
    |
    v
[Supervisor] --> /command --> [Command Registry]
    |
    v
[Agent Runtime]
    |
    +---> [Auditor] --> Security checks
    |
    +---> [Tools] --> bash, read, write, edit, grep, glob, web_fetch
    |
    +---> [Memory] --> SQLite persistent store
    |
    v
[Event Bus] --> [Terminal UI]
```

All state is stored locally in `.obsidian/state.db` (SQLite).

---

## Security

- **Auditor**: Pre-flight validation of all commands and file operations
- **PII Redaction**: Automatic sanitation of sensitive data from LLM context
- **Approval Prompts**: Explicit confirmation for destructive operations
- **Secure Storage**: System Keychain integration for API keys
- **Audit Logging**: Complete trail of all agent actions

---

## Model Support

Obsidian works with Claude 4.5 models:

| Model | Best For |
|-------|----------|
| **Opus 4.5** | Complex reasoning, architecture decisions |
| **Sonnet 4.5** | Balanced performance (default) |
| **Haiku 4.5** | Fast responses, simple tasks |

Configure with `/init` or `/models`.

---

## MCP Integration

Extend Obsidian with Model Context Protocol servers:

```
/mcp
```

Install certified tools:
- `filesystem` - Enhanced file operations
- `git` - Repository management
- `research` - Web search and analysis
- `context7` - Documentation lookup

---

## Documentation

| Resource | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System internals and design |
| [Tools Reference](docs/TOOLS.md) | Built-in tool documentation |
| [Sandboxing](docs/SANDBOX.md) | OS-level isolation setup |
| [CLI Design](docs/CLI_DESIGN_SYSTEM.md) | UI specifications |

---

## Development

```bash
npm run dev      # Watch mode
npm run build    # Build distribution
npm test         # Run tests
npm start        # Run locally
```

---

## License

Copyright 2026 Aurora Labs. Licensed under [Apache 2.0](LICENSE).
