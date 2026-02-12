# Areas Needing Attention

## 🔴 Critical Issues

### 1. Massive File: tools.ts (2,476 lines)
**Problem:** Unmaintainable monolith containing all tool definitions

**Split into:**
```
src/tools/
├── index.ts          # Registry
├── filesystem/
│   ├── read.ts
│   ├── write.ts
│   ├── edit.ts
│   ├── delete.ts
│   └── list.ts
├── execution/
│   ├── bash.ts
│   └── computer.ts
├── network/
│   ├── web-fetch.ts
│   └── http.ts
├── mcp/
│   ├── manage.ts
│   └── call.ts
└── system/
    ├── memory.ts
    ├── scheduler.ts
    └── tasks.ts
```

**Benefits:**
- Easier maintenance
- Better testability
- Faster development
- Clear separation of concerns

### 2. Large File: llm.ts (1,668 lines)
**Problem:** Complex provider logic, streaming, history management all mixed

**Refactor into:**
```
src/llm/
├── client.ts         # Main LLMClient class
├── streaming.ts      # Stream handling logic
├── history.ts        # Conversation history management
├── context.ts        # Context compression/summarization
├── computer-use.ts   # Computer use mode
└── tokens.ts         # Token counting
```

### 3. Large File: Root.tsx (763 lines)
**Problem:** UI component doing too much

**Split into:**
```
src/ui/
├── Root.tsx          # Main coordinator (200 lines max)
├── hooks/
│   ├── useEvents.ts
│   ├── useActivity.ts
│   └── useInput.ts
├── ChatView.tsx      # Separate component
└── StatusBar.tsx     # Separate component
```

## 🟡 Important Improvements

### 4. No Unit Tests
**Problem:** Zero test coverage for new MoE features

**Add tests for:**
```
tests/
├── providers/
│   ├── anthropic.test.ts
│   ├── ollama.test.ts
│   └── router.test.ts
├── tools/
│   └── [tool tests]
└── integration/
    └── moe.test.ts
```

### 5. Error Handling
**Problem:** Some errors silently caught

**Files to review:**
- `src/core/llm.ts` - Lines with empty catch blocks
- `src/core/tools.ts` - Tool execution error handling
- `src/core/providers/ollama.ts` - Network error handling

**Add:**
- Proper error types
- Error recovery strategies
- User-friendly error messages

### 6. Memory System Complexity
**File:** `src/core/memory.ts` (661 lines)

**Issues:**
- Multiple responsibilities (storage, search, summarization)
- Vector embeddings inline
- No clear separation

**Refactor:**
```
src/memory/
├── store.ts          # Storage layer
├── search.ts         # Search/retrieval
├── embeddings.ts     # Vector operations
└── summarization.ts  # Memory compression
```

### 7. Settings Menu Navigation
**File:** `src/components/SettingsMenu.tsx` (468 lines)

**Issues:**
- Deep nesting (categories > provider > models)
- Confirmation flow complex
- Too many views

**Simplify:**
- Flatten structure
- Use tabs instead of nested views
- Reduce confirmation prompts

## 🟢 Nice-to-Have Improvements

### 8. Type Safety
**Problem:** Some `any` types in new code

**Files:**
```typescript
src/core/providers/ollama.ts:162:    const params: any = {
src/core/router.ts:45:              .map((b: any) => b.text)
src/commands/models.ts:89:           await switchProvider(args[1] as any, currentConfig);
```

**Fix:** Replace with proper types

### 9. Duplicate Code
**Problem:** Similar logic in multiple places

**Examples:**
- Model name formatting (config, commands, UI)
- Provider availability checks
- Event emission patterns

**Solution:** Extract to shared utilities

### 10. Performance Optimizations

**Current Issues:**
- Event bus has no batching
- Multiple settings reloads
- Repeated file reads

**Optimizations:**
```typescript
// Batch events
bus.batchEmit([event1, event2, event3]);

// Cache settings
const settingsCache = new Map();

// Memoize expensive operations
const memoizedRead = memoize(fs.readFile);
```

### 11. Documentation Gaps

**Missing docs:**
- API documentation for providers
- Architecture decision records (ADRs)
- Contributing guide
- Deployment guide

**Add:**
```
docs/
├── API.md
├── ARCHITECTURE.md
├── CONTRIBUTING.md
└── DEPLOYMENT.md
```

### 12. Security Hardening

**Review needed:**
- Input validation in tools
- Path traversal prevention
- Command injection prevention
- API key exposure in logs

**Files:**
```
src/core/tools.ts       # Validate all inputs
src/core/sandbox.ts     # Strengthen sandboxing
src/core/redactor.ts    # Expand PII patterns
```

### 13. UX Polish

**Quick wins:**
- Add progress indicators for model downloads
- Better error messages (actionable, not technical)
- Keyboard shortcuts reference
- First-run tutorial

**Commands to add:**
```
/help models    # Context-sensitive help
/quick-start    # Interactive tutorial
/shortcuts      # Show keyboard shortcuts
```

### 14. Config Validation

**Problem:** No validation when manually editing config

**Add:**
```typescript
// src/core/config.ts
async validate(): Promise<ValidationResult> {
  // Check provider mode valid
  // Check Ollama models exist
  // Check API key format
  // Check paths are absolute
}
```

### 15. Logging System

**Current:** Mix of bus.emitAgent and console.log

**Needed:**
```typescript
// src/core/logger.ts
class Logger {
  debug(msg: string)
  info(msg: string)
  warn(msg: string)
  error(msg: string)

  // With levels, file output, rotation
}
```

## 📊 Metrics

**Current Codebase:**
- Total lines: ~22,836
- Largest file: 2,476 lines
- Average file size: ~380 lines
- Files > 500 lines: 9

**After Refactor (Estimated):**
- Total lines: ~22,836 (same)
- Largest file: <500 lines
- Average file size: ~200 lines
- Files > 500 lines: 0

## 🎯 Priority Roadmap

### Phase 1: Critical (Week 1)
1. Split tools.ts into modules
2. Add basic unit tests for providers
3. Fix type safety issues

### Phase 2: Important (Week 2)
4. Refactor llm.ts
5. Split Root.tsx
6. Improve error handling

### Phase 3: Polish (Week 3)
7. Add documentation
8. UX improvements
9. Performance optimizations

### Phase 4: Long-term
10. Comprehensive test suite
11. Security audit
12. Plugin system

## 🔧 Quick Wins (Do Now)

**Easy fixes that make big difference:**

1. **Add .prettierrc** - Format code consistently
2. **Add .eslintrc** - Catch bugs early
3. **Update README** - Add MoE documentation
4. **Add CHANGELOG** - Track changes
5. **Create examples/** - Usage examples

## 📝 Code Quality Checklist

- [ ] All files < 500 lines
- [ ] No `any` types
- [ ] Test coverage > 80%
- [ ] All errors handled
- [ ] All inputs validated
- [ ] Documentation complete
- [ ] No console.log (use logger)
- [ ] No hardcoded strings
- [ ] No magic numbers
- [ ] Consistent naming

## 🚀 Immediate Actions

**Run these commands:**
```bash
# 1. Add linting
npm install -D eslint @typescript-eslint/eslint-plugin
npx eslint --init

# 2. Add formatting
npm install -D prettier
echo '{ "semi": true, "singleQuote": true }' > .prettierrc

# 3. Add pre-commit hooks
npm install -D husky lint-staged
npx husky init

# 4. Run tests
npm test -- --coverage
```

## 💡 Suggestions Summary

**By Category:**
- 🔴 Critical: 3 items (massive files)
- 🟡 Important: 5 items (tests, errors, complexity)
- 🟢 Nice-to-have: 7 items (polish, docs, perf)

**Total effort:** ~3 weeks for full cleanup

**ROI:** High - Much easier to maintain, fewer bugs, faster development
