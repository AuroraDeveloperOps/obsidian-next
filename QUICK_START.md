# Obsidian Next - Quick Start

## Getting Started

```bash
npm install
npm run build
npm start
```

On first launch, the **Setup Wizard** runs automatically. It guides you through:

1. **Provider Selection** - Claude (recommended) or Ollama (offline)
2. **API Key / Endpoint** - Configure your chosen provider
3. **Model Selection** - Pick your default model
4. **Mode Selection** - Safe (default), Plan, or Auto
5. **Connection Test** - Verifies everything works

Re-run anytime with `/init`.

## Key Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/models` | Select AI model |
| `/mode` | Switch mode (auto/plan/safe) |
| `/status` | System status |
| `/settings` | Edit configuration |
| `/ollama` | Browse and manage Ollama models |
| `/memory` | View agent memory |
| `/diff` | View file changes |
| `/undo` | Undo file changes |
| `/schedule` | Schedule background tasks |
| `/doctor` | Run diagnostics |
| `/clear` | Clear conversation |
| `/exit` | Save session and exit |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Open command palette |
| `Shift+Tab` | Cycle mode (auto/plan/safe) |
| `Ctrl+T` | Open task view |
| `Ctrl+C` | Save and exit |
| `Esc` | Close overlay / cancel |

## Provider Modes

### Claude (API)
- Set `ANTHROPIC_API_KEY` or run `/init`
- Models: Opus 4.6, Sonnet 4.5, Haiku 4.5
- Full tool calling, extended thinking, 200k context

### Ollama (Offline)
- Install: https://ollama.ai
- Run `/ollama` to browse curated models
- Recommended: Qwen 2.5 Coder 7B, Llama 3.1 8B
- Supports remote endpoints with auth

### MoE (Smart Routing)
- Routes queries to the best available model
- Simple tasks stay local, complex tasks use Claude
- Configure with `/models moe`

## Execution Modes

- **Safe** (default) - Read ops auto-approve, writes require confirmation
- **Plan** - Read-only, approval required before any execution
- **Auto** - Execute tools without confirmation

## Configuration

Config stored at `~/.obsidian-next/config.json`:

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "maxTokens": 8192,
  "provider": "anthropic",
  "ollama": {
    "host": "localhost",
    "port": 11434
  }
}
```

## Troubleshooting

### API key issues
```
Run /init to reconfigure your API key
```

### Ollama not responding
```bash
ollama serve        # Start the server
/ollama             # Check status in the registry view
```

### Model not found
```
/models pull <model-name>   # Pull via CLI
/ollama                     # Or use the registry UI
```
