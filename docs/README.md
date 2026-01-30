# Obsidian Next

> Open-source AI Agent CLI - A Claude Code alternative.

**Obsidian Next** is a professional, structured, and secure AI agent interface for the terminal. It features a "Structure-First" architecture where agents emit typed events instead of raw streams, ensuring a rigorous and interactive user experience.

## Features
- **8 Tools**: bash, read, write, edit, list, grep, glob, web_fetch
- **14 Commands**: /help, /init, /config, /models, /clear, /cost, /usage, /status, /mode, /task, /tool, /sandbox, /undo, /doctor
- **3 Modes**: auto (yolo), plan (review first), safe (default)
- **Security**: Auditor blocks dangerous commands, sandbox execution
- **Tracking**: Context, usage, costs, undo history

## Documentation
- **[Architecture](ARCHITECTURE.md)**: EventBus, Supervisor, Tools
- **[Agent Architecture](AGENT_ARCHITECTURE.md)**: Modes, execution flow
- **[Tools](TOOLS.md)**: Available tools and safety checks
- **[Design System](CLI_DESIGN_SYSTEM.md)**: Visual guidelines

## Quick Start
```bash
# Install dependencies
npm install

# Set API key
export ANTHROPIC_API_KEY=sk-...

# Build and run
npm run build
node dist/index.js
```

## Commands
```
/help     - Show all commands
/clear    - Reset conversation
/mode     - Set mode (auto/plan/safe)
/cost     - Show session cost
/doctor   - Run diagnostics
```

## License
MIT License. See [LICENSE](../LICENSE) for details.
