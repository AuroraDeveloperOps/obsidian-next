# Obsidian Next - Offline MoE Quick Start

## 🚀 Everything is Ready!

Your system is configured for offline AI operation with Mixture of Experts routing.

### Current Setup
- ✅ Ollama running on localhost:11434
- ✅ Models downloaded and ready:
  - `llama3.1:8b-instruct-q4_K_M` (4.9GB) - Function calling
  - `qwen2.5:3b-instruct-q4_K_M` (1.9GB) - Fast chat
- ✅ Build successful
- ✅ Commands registered

## Quick Commands

### Check System Status
```bash
npm start
/models
```

**Output:**
```
[CLAUDE MODELS]
   1. Opus 4.6 (Intelligence King) [Current]
   2. Sonnet 4.5 (Balanced)
   ...

[OLLAMA MODELS]
   5. llama3.1:8b-instruct-q4_K_M
   6. qwen2.5:3b-instruct-q4_K_M

[SPECIAL MODES]
   7. MoE (Intelligent Routing)

[PROVIDER MODE: ANTHROPIC]
   ⎿  /models <1-7|name>      Select model or mode
   ⎿  /models pull <model>    Download Ollama model
```

### Switch to Offline Mode
```bash
/models 6
# OR
/models qwen2.5:3b
```

Now ALL queries use local models (no API calls).

### Switch to MoE (Smart Routing)
```bash
/models moe
# OR select its number (e.g., 7)
/models 7
```

Now the router picks the best model for each task:
- Simple questions → qwen2.5 (fast)
- Tool calls → llama3.1 (accurate)
- Complex reasoning → Claude (if API key) or llama3.1

## Example Usage

### Simple Chat (uses qwen2.5:3b)
```
You: What is the capital of France?
Obsidian: Paris
```

### Tool Calling (uses llama3.1:8b)
```
You: Read the file package.json
Obsidian: [reads file and shows content]
```

### Code Questions (uses llama3.1:8b)
```
You: How do I add a new command?
Obsidian: [explains command registration]
```

## Performance Expectations

**Your Hardware:** 8GB RAM, Intel i3-8100B

| Task | Model Used | Speed | Quality |
|------|------------|-------|---------|
| Simple Q&A | qwen2.5:3b | ~25 tok/s | Good |
| Tool execution | llama3.1:8b | ~12 tok/s | Very Good |
| Code generation | llama3.1:8b | ~12 tok/s | Good |

**Note:** Only one model loads at a time (RAM constraint). Models swap on-demand.

## Advanced Usage

### Download New Model
```bash
/models pull <model-name>

# Example:
/models pull deepseek-r1:8b
```

### Configure Custom Models
Edit `~/.obsidian-next/config.json`:
```json
{
  "provider": "moe",
  "ollama": {
    "models": {
      "tool": "your-preferred-tool-model",
      "chat": "your-preferred-chat-model",
      "reasoning": "your-preferred-reasoning-model"
    }
  }
}
```

### Setup Wizard
```bash
/setup         # General setup
/setup ollama  # Ollama-specific guide
```

## Recommended Models by Task

### For Function Calling (replaces tool model)
- `llama3.1:8b-instruct-q4_K_M` ⭐ (current)
- `dolphin3:8b-llama3.1-q4_K_M` (better for code)
- `qwen2.5-coder:7b-q4_K_M` (best for coding)

### For Chat (replaces chat model)
- `qwen2.5:3b-instruct-q4_K_M` ⭐ (current)
- `llama3.2:3b-q4_K_M` (alternative)
- `phi3:mini-q4_K_M` (Microsoft, efficient)

### For Complex Reasoning (requires 16GB+ RAM)
- `qwen3:14b-q4_K_M` (best quality, won't fit)
- `deepseek-r1:8b-q4_K_M` (alternative)

## Troubleshooting

### "Ollama not running"
```bash
ollama serve
```

### "Model not found"
```bash
ollama pull <model-name>
```

### "Out of memory"
Your 8GB RAM limits you to 8B models max. Avoid:
- 14B+ models
- Running multiple large models
- Models without Q4 quantization

### Models run slow
**Normal on CPU:**
- qwen2.5:3b → 20-30 tok/s
- llama3.1:8b → 10-15 tok/s

**If slower:**
- Close other apps
- Use smaller models
- Check CPU usage (`top`)

## Comparison: Offline vs API

| Feature | Offline (Ollama) | API (Claude) |
|---------|------------------|--------------|
| **Cost** | Free | Pay per token |
| **Privacy** | 100% local | Cloud |
| **Speed** | 10-25 tok/s (CPU) | 40-60 tok/s |
| **Quality** | Good | Excellent |
| **Context** | 8k-32k tokens | 200k tokens |
| **Thinking** | No | Yes (Opus) |
| **Internet** | Not needed | Required |

**Best of both:** Use MoE mode - simple tasks stay local, complex tasks use Claude.

## Files & Directories

```
~/.obsidian-next/
├── config.json          # Configuration
├── settings.json        # User preferences
├── sessions/           # Conversation history
└── memory/             # Agent memory

~/.ollama/
└── models/             # Downloaded models (10-20GB)
```

## Next Steps

1. **Try it out:** `npm start` and ask questions
2. **Test tool calling:** Ask to read files, run commands
3. **Switch modes:** Try anthropic/ollama/moe
4. **Monitor:** Use `/models` to see current routing and active model
5. **Optimize:** Adjust models based on your usage

## Support

- **Docs:** See `MoE_COMPLETE.md` for architecture details
- **Tests:** See `TEST_RESULTS.md` for verification
- **Status:** See `IMPLEMENTATION_STATUS.md` for features

---

**You're all set!** Start with `/models moe` for the best experience.
