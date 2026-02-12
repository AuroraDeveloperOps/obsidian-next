# MoE Performance Troubleshooting

## Problem
MoE mode took 247 seconds to respond to "hi" - this is abnormally slow.

## Likely Causes

### 1. **Wrong Model Size**
- `smollm:latest` might be pointing to a large variant
- Check actual model size: `ollama list`
- SmolLM has variants: 135M (fast), 360M (medium), 1.7B (slow)

**Fix:**
```bash
# Pull the smallest variant explicitly
ollama pull smollm:135m

# Update config to use specific size
# Edit config.json and change:
"ollama": {
  "models": {
    "chat": "smollm:135m",  // Use smallest for speed
    "tool": "functiongemma:2b",  // Smallest FuncGemma
    "reasoning": "smollm:360m"  // Medium for complex tasks
  }
}
```

### 2. **No GPU Acceleration**
- If running on CPU only, inference is very slow
- Check: `ollama ps` should show GPU memory usage

**Fix:**
- Ensure CUDA/ROCm/Metal is installed
- On macOS: Use Metal acceleration (automatic)
- On Linux: Install nvidia-docker or ROCm
- Consider using quantized models (Q4_K_M)

### 3. **Model Not Preloaded**
- First request loads model into memory (~10-30 seconds)
- Subsequent requests should be instant

**Fix:**
```bash
# Preload model
ollama run smollm:135m ""

# Keep alive (in config)
"keep_alive": "1h"  // Keep model in memory
```

### 4. **Wrong Ollama Version**
- Older Ollama versions have slower inference

**Fix:**
```bash
# Update Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Verify version (should be >= 0.1.40)
ollama --version
```

### 5. **Insufficient RAM/VRAM**
- Model doesn't fit in memory, swapping to disk

**Check:**
```bash
ollama ps  # Check memory usage
free -h    # Check available RAM
nvidia-smi  # Check VRAM (if NVIDIA)
```

**Fix:**
- Use smaller models (smollm:135m uses ~512MB)
- Close other applications
- Consider quantized models (Q4 = 4-bit, smaller memory)

## Recommended Configuration

For fast offline chat, use smallest models:

```json
{
  "provider": "moe",
  "ollama": {
    "baseUrl": "http://localhost:11434",
    "models": {
      "tool": "functiongemma:2b",
      "chat": "smollm:135m",
      "reasoning": "smollm:360m"
    }
  }
}
```

## Performance Benchmarks

Expected response times on modern hardware:

| Model | First Load | Subsequent | Tokens/sec |
|-------|------------|------------|------------|
| smollm:135m | 5-10s | <1s | 50-100 |
| smollm:360m | 10-15s | 1-2s | 30-60 |
| smollm:1.7b | 15-30s | 2-5s | 15-30 |
| functiongemma:2b | 10-20s | 1-3s | 20-40 |

If you're seeing 247 seconds, something is seriously wrong.

## Debugging Steps

1. **Check if Ollama is running:**
```bash
curl http://localhost:11434/api/tags
```

2. **Check which model is actually loaded:**
```bash
ollama list
ollama ps  # Shows currently running models
```

3. **Test model directly:**
```bash
time ollama run smollm:latest "hi"
```
Should respond in <10 seconds.

4. **Check logs:**
```bash
# macOS
tail -f ~/Library/Logs/Ollama/server.log

# Linux
journalctl -u ollama -f
```

5. **Test with smaller model:**
```bash
ollama pull tinyllama  # Only 1.1GB
time ollama run tinyllama "hi"
```

## Quick Fix

If MoE is too slow, switch back to Anthropic-only mode:

```bash
# In Obsidian CLI
/config

# Or edit config directly:
{
  "provider": "anthropic"  // Use Claude for everything
}
```

## Router Classification

For "hi" message, router should classify as `simple_chat` and route to SmolLM.
Check router logs in the output - should see:
```
[MoE] Routing to smollm:135m for chat
```

If you see something else, the classification might be wrong.
