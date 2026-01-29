# Obsidian Next

> A professional AI Agent CLI.

**Obsidian Next** is a professional, structured, and secure AI agent interface for the terminal. It features a "Structure-First" architecture where agents emit typed events instead of raw streams, ensuring a rigorous and interactive user experience.

## Documentation
- **[Contributing Guide](../CONTRIBUTING.md)**: Git workflow, standards, and setup.
- **[Design System](CLI_DESIGN_SYSTEM.md)**: Visual guidelines (No Emojis, Strict ASCII).
- **[Architecture](ARCHITECTURE.md)**: EventBus, Supervisor, and Worker topology.
- **[Tools](TOOLS.md)**: Available capabilities and safety checks.

## Quick Start
```bash
# Install dependencies
npm install

# Initialize configuration (Secrets via Env Vars)
export ANTHROPIC_API_KEY=sk-...
npm run build
node dist/index.js
```

## License
MIT License. See [LICENSE](../LICENSE) for details.
