# Offline MoE Implementation Status

## Completed Components

### 1. Provider Abstraction Layer ✅
**File:** `src/core/providers/provider.ts`
- Defined `ModelProvider` interface for pluggable LLM backends
- Created `StreamChunk` interface for unified streaming
- Defined `ProviderCapabilities` for feature detection
- Supports: streaming, tool calling, thinking, caching, computer use, vision

### 2. Anthropic Provider ✅
**File:** `src/core/providers/anthropic.ts`
- Implements `ModelProvider` interface
- Wraps existing Anthropic SDK functionality
- Maintains all features: thinking, caching, tool calling, vision
- Handles token counting
- Streaming with proper chunk conversion

### 3. Ollama Provider ✅
**File:** `src/core/providers/ollama.ts`
- Implements `MultiModelProvider` interface
- HTTP client for Ollama REST API
- Message format conversion (Anthropic → Ollama)
- Tool calling support (OpenAI-compatible format)
- Streaming with token estimation
- Model listing and availability checks

### 4. Model Router ✅
**File:** `src/core/router.ts`
- Intelligent routing between providers
- Three modes:
  - **anthropic**: API-only
  - **ollama**: Local-only
  - **moe**: Mixture of Experts (intelligent routing)
- Task classification:
  - tool_calling → FuncGemma
  - simple_chat → SmolLM
  - complex_reasoning → Claude (with fallback)
- Graceful fallbacks when providers unavailable

### 5. Configuration Schema ✅
**File:** `src/core/config.ts`
- Added `provider` field (anthropic/ollama/moe)
- Added `ollama` configuration object:
  - baseUrl (default: http://localhost:11434)
  - models: tool, chat, reasoning
- Backward compatible (defaults to 'anthropic')

### 6. Models Command ✅
**File:** `src/commands/models.ts`
- Enhanced existing command with provider management
- Subcommands:
  - `/models` - Show Claude model selection
  - `/models list` - List Ollama models
  - `/models pull <name>` - Download Ollama model
  - `/models status` - Show provider status
  - `/models switch <mode>` - Change provider mode
- Maintains existing model selection functionality

### 7. Settings Menu ✅
**File:** `src/components/SettingsMenu.tsx`
- Added 'Provider Settings' category
- Provider mode selection UI
- Shows current provider and model status

### 8. Dependencies ✅
**File:** `package.json`
- Added `ollama` package (v0.5.18)

## Integration Status

### ✅ Completed
1. Provider abstraction layer
2. Ollama provider implementation
3. Anthropic provider wrapper
4. Model router with intelligent routing
5. Configuration schema updates
6. Models command enhancements
7. Settings UI updates
8. Build verification (no compilation errors)

### ⚠️ Pending
1. **LLM Client Integration**
   - `src/core/llm.ts` needs to use router
   - Should check provider mode at start of `streamChat()`
   - Route to appropriate provider
   - Maintain backward compatibility

2. **Testing**
   - Unit tests for providers
   - Integration tests for router
   - End-to-end offline mode testing

3. **Documentation**
   - User guide for offline setup
   - Ollama installation instructions
   - Model recommendations by hardware

## Recommended Next Steps

### 1. Complete LLM Integration
```typescript
// In llm.ts, at the start of streamChat():
const cfg = await config.load();
if (cfg.provider !== 'anthropic') {
    // Use router for ollama/moe modes
    const provider = await router.route(this.conversationHistory);
    // Stream from provider instead of direct Anthropic client
}
```

### 2. Testing Checklist
- [ ] Anthropic-only mode works (existing functionality)
- [ ] Ollama-only mode works (requires Ollama running)
- [ ] MoE mode intelligently routes
- [ ] Fallbacks work when providers unavailable
- [ ] Tool calling works with FuncGemma
- [ ] Context management works with all providers

### 3. User Onboarding
- [ ] Detect if Ollama installed
- [ ] Guide user through model installation
- [ ] Suggest hardware-appropriate models
- [ ] Provider capability warnings

### 4. Performance Optimization
- [ ] Minify provider code
- [ ] Lazy-load Ollama provider
- [ ] Cache provider availability checks
- [ ] Optimize router classification

## Architecture Decisions

### Why Providers?
- **Pluggable backends**: Easy to add new providers (LocalAI, LM Studio)
- **Consistent interface**: Same API regardless of backend
- **Feature detection**: Capabilities object prevents feature misuse
- **Graceful degradation**: Fallbacks when features unavailable

### Why MoE?
- **Cost optimization**: Use free local models when possible
- **Offline operation**: Continue working without internet
- **Specialized performance**: Route tasks to optimal models
- **Privacy**: Keep sensitive data local

### Why Router?
- **Intelligent routing**: Automatic provider selection
- **Task classification**: Pattern-based routing decisions
- **Transparent**: No API changes for existing code
- **Flexible**: Easy to add new routing strategies

## Known Limitations

1. **Token counting**: Ollama doesn't provide accurate counts (uses estimation)
2. **Context limits**: Local models have smaller contexts (2k-8k vs 200k)
3. **Tool calling**: Only FuncGemma supports function calling reliably
4. **Vision**: Most local models don't support images
5. **Thinking**: Extended thinking only in Claude Opus

## Migration Path

### Phase 1: Beta (Current)
- Providers implemented but not integrated
- Manual testing required
- For advanced users only

### Phase 2: Integration
- Router integrated into LLM client
- Automatic provider detection
- Graceful fallbacks

### Phase 3: Optimization
- Performance tuning
- UI polish
- Comprehensive testing

### Phase 4: Release
- Documentation complete
- Onboarding flow
- Default to 'anthropic' for safety
