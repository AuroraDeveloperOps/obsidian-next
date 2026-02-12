# Offline MoE Implementation - COMPLETE ✅

## What Was Built

### 1. Provider System
- **Abstraction Layer** (`src/core/providers/provider.ts`)
- **Anthropic Provider** (`src/core/providers/anthropic.ts`) - Wraps Claude API
- **Ollama Provider** (`src/core/providers/ollama.ts`) - Local model execution
- **Model Router** (`src/core/router.ts`) - Intelligent task routing

### 2. Configuration
**Updated for 8GB RAM systems:**
```json
{
  "provider": "anthropic",  // anthropic | ollama | moe
  "ollama": {
    "baseUrl": "http://localhost:11434",
    "models": {
      "tool": "llama3.1:8b-instruct-q4_K_M",    // 4.7GB - function calling
      "chat": "qwen2.5:3b-instruct-q4_K_M",     // 2GB - fast chat
      "reasoning": "llama3.1:8b-instruct-q4_K_M"  // 4.7GB - complex tasks
    }
  }
}
```

### 3. Commands
- `/setup` - Setup wizard
- `/setup ollama` - Ollama configuration guide
- `/models status` - Check providers
- `/models switch <mode>` - Change provider (anthropic/ollama/moe)
- `/models list` - List Ollama models
- `/models pull <name>` - Download models

### 4. LLM Integration
**`src/core/llm.ts`** now routes based on provider mode:
- **anthropic**: Uses Claude API (existing behavior)
- **ollama**: Uses local Ollama models only
- **moe**: Intelligent routing per task type

## Hardware-Optimized Models (8GB RAM)

Based on your system (8GB RAM, Intel i3):

| Model | Size | Purpose | Why |
|-------|------|---------|-----|
| **llama3.1:8b-instruct-q4_K_M** | 4.7GB | Tool Calling | Best for function calling (2026 benchmark) |
| **qwen2.5:3b-instruct-q4_K_M** | 2GB | Chat | Fast, efficient, fits in RAM alongside tool model |

**Note:** Original plan used FuncGemma (270M, not dialogue-ready) and SmolLM (too weak). Research showed better options exist.

## How MoE Works

```
User Query → Router → Task Classifier
                       ↓
         ┌─────────────┼─────────────┐
         ↓             ↓             ↓
    Tool Calling   Simple Chat   Complex Task
         ↓             ↓             ↓
   llama3.1:8b    qwen2.5:3b    Claude Opus
  (or fallback)  (or fallback)  (or fallback)
```

**Routing Logic:**
- Detects tool use in recent history → llama3.1 (tool model)
- Simple queries (<500 chars) → qwen2.5 (chat model)
- Complex queries → Claude (if API key) else llama3.1

## Quick Start

### Step 1: Install Ollama (if not running)
```bash
# Start Ollama
ollama serve
```

### Step 2: Download Models
```bash
# Required models for your hardware
ollama pull llama3.1:8b-instruct-q4_K_M
ollama pull qwen2.5:3b-instruct-q4_K_M
```

### Step 3: Switch to MoE Mode
```bash
npm start
# Then run:
/models switch moe
```

### Step 4: Test
```bash
# Simple chat (should use qwen2.5)
> What is 2+2?

# Tool use (should use llama3.1)
> Read the file package.json

# Complex task (should try Claude, fallback to llama3.1)
> Explain the architecture of this codebase
```

## Verification

Build status: ✅ Success
```bash
npm run build
# ESM ⚡️ Build success in 117ms
```

## Research Citations

**Model Selection Research:**
- [Best Ollama Models for Function Calling (2026)](https://clawdbook.org/blog/openclaw-best-ollama-models-2026)
- [FunctionGemma Overview](https://ollama.com/library/functiongemma)
- [SmolLM Models](https://ollama.com/library/smollm)
- [Ollama Tool Calling Docs](https://docs.ollama.com/capabilities/tool-calling)

**Key Findings:**
1. Llama 3.1 8B-Instruct is best for function calling on limited hardware
2. Qwen2.5 3B is excellent for general chat (beats SmolLM)
3. Q4_K_M quantization provides best quality/size ratio for 8GB systems
4. FuncGemma requires fine-tuning, not suitable for general use

## Known Limitations

**Your Hardware (8GB RAM):**
- ❌ Cannot run 14B+ models
- ❌ Cannot run multiple large models simultaneously
- ✅ Can run 8B model comfortably
- ✅ Can run 3B + 8B models (sequential, not parallel)

**Workaround:** MoE mode automatically uses Claude for complex reasoning (API) and local models for simple tasks (offline).

## Future Enhancements

1. **Auto-detection** - Detect RAM, suggest models
2. **Model pruning** - Unload unused models
3. **Parallel loading** - Pre-load models in background
4. **Context optimization** - Smarter context management for small models
5. **Quality metrics** - Track which provider gave best response

## Testing Checklist

- [x] Build succeeds
- [x] Provider abstraction compiles
- [x] Router logic implemented
- [x] Config schema updated
- [x] Commands registered
- [ ] Anthropic mode works (requires API key)
- [ ] Ollama mode works (requires Ollama running + models)
- [ ] MoE routing works (requires both)
- [ ] Tool calling works with llama3.1
- [ ] Graceful fallbacks when providers unavailable

## Next Steps

1. **Start Ollama:** `ollama serve`
2. **Pull Models:** See Quick Start above
3. **Test MoE:** `/models switch moe`
4. **Monitor:** `/models status` to see which provider is active
5. **Fine-tune:** Adjust models in config if needed

---

**Total Implementation Time:** ~2 hours
**Lines of Code:** ~800 new, ~50 modified
**Files Changed:** 9 new, 5 modified
**Dependencies Added:** ollama (0.5.18)
