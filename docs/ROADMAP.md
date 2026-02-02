# Obsidian Next - Roadmap v0.5.0

> Updated: 2026-02-02 | Status: Active Development

This roadmap reflects the comprehensive audit performed on 2026-02-02, identifying critical gaps compared to production-grade AI coding assistants like Claude Code.

---

## Current State: v0.4.5

**Test Coverage:** 208 tests passing (10 test files)
**Architecture Maturity:** 6.5/10 (Good foundation, needs hardening)

### What's Working Well
- Event-driven architecture with typed EventBus
- SQLite state persistence (sessions, tasks, memory, usage)
- Security intent (auditor, sandbox, redactor, PII handling)
- 8 core tools with approval workflow
- 17 slash commands
- Clean separation of concerns

### Critical Gaps Identified
- Security via patterns, not verification
- No observability (metrics, tracing)
- 137 instances of `any` type
- UI/UX flow issues
- Testing is unit-heavy, missing integration/E2E

---

## Phase 0: Immediate Fixes (P0)

> Timeline: This Week | Blocking Production

### 0.1 Security Hardening
- [ ] **AST-based command parsing** - Replace regex auditor with proper shell parsing
  - File: `src/core/auditor.ts`
  - Risk: Obfuscation bypass possible with current patterns

- [ ] **Symlink defense** - Add `fs.lstat()` checks to prevent traversal
  - File: `src/core/auditor.ts:118-138`
  - Risk: Can read `~/.ssh/id_rsa` via symlink in workspace

- [ ] **MCP binary verification** - Verify server binaries with checksums
  - File: `src/core/mcp.ts`
  - Risk: Binary swap attacks on MCP servers

- [ ] **Enable PII redaction by default**
  - File: `src/core/agent.ts:82`
  - Current: `redactor.setEnabled(false)` - API keys can leak

### 0.2 Critical Bug Fixes
- [x] ~~Fix auditor test mock (missing `isSessionAuthorized`)~~
- [x] ~~Fix memory test mock (wrong header text)~~
- [ ] Fix approval race condition in `ApprovalPrompt.tsx:31-44`
  - Use `useRef` for single-fire guarantee instead of `useState`

---

## Phase 1: Code Quality (P1)

> Timeline: Week 1-2 | High Priority

### 1.1 Type Safety
- [ ] **Eliminate `any` types** - 137 instances across codebase
  - Priority files: `src/core/session.ts`, `src/core/llm.ts`, `src/core/tools.ts`
  - Solution: Create Zod schemas for DB rows, MCP tools

- [ ] **Add input validation** - Validate tool args against schema before execution
  - File: `src/core/tools.ts:1214-1228`
  - Use `tool.inputSchema` validation in `execute()`

### 1.2 Error Handling
- [ ] **Add retry/backoff logic** for LLM API failures
  - Package: `exponential-backoff` or `bottleneck`
  - Location: `src/core/llm.ts`

- [ ] **Circuit breaker** for flaky API calls
  - Prevent cascading failures

- [ ] **Error recovery paths** - Provide hints in error messages
  - Current: Generic "Command blocked for safety"
  - Better: "Approval required for: [cmd]. Press 'y' to approve."

### 1.3 Structured Logging
- [ ] **Replace console.error** with structured logger
  - 15+ instances across codebase using `console.error`
  - Add correlation IDs for debugging
  - Package: `pino` or `winston`

---

## Phase 2: UI/UX Improvements (P1)

> Timeline: Week 2-3 | High Priority

### 2.1 Approval Prompt Clarity
- [x] ~~Improve approval prompt wording~~ (Completed)
- [x] ~~Clear action options with descriptions~~
- [ ] Add command syntax highlighting in approval prompt

### 2.2 Missing UI Components
- [ ] **Implement DiffView rendering** - Currently defined but never shown
  - File: `src/components/DiffView.tsx`
  - Users approve operations blindly without seeing full diff

- [ ] **Fix ToolOutput expansion** - Claims to be expandable but isn't
  - File: `src/components/ToolOutput.tsx:60-92`
  - "+N lines" shown but users can't expand

- [ ] **Add progress indicators** - For operations >1s
  - Use MorphSpinner (exists but unused)
  - Locations: Settings save, session load, diagnostics

### 2.3 Navigation & Discovery
- [ ] **Keyboard shortcut help** (`/keys` command)
  - Consolidate scattered keybindings documentation
  - ApprovalPrompt, ChoicePrompt, SettingsMenu all have different keys

- [ ] **Command search by description** - Not just prefix
  - File: `src/ui/CommandPopup.tsx`
  - Users can't find `/resume` by typing "session"

- [ ] **Command categories/groups** - Organize flat list
  - Settings, Navigation, Actions groups

### 2.4 Feedback & State
- [ ] **Toast notification system** - Replace inline status messages
  - Proper queue for concurrent operations
  - Acknowledgeable success/error states

- [ ] **Fix busy state** - Long tools show "Thinking..." forever
  - Add timeout warning after 30s
  - Show actual tool progress

- [ ] **Message history scrolling** - Can't navigate past 50 messages
  - File: `src/ui/Root.tsx:59` (MAX_EVENTS=50)

---

## Phase 3: Testing & Quality (P1)

> Timeline: Week 3-4 | High Priority

### 3.1 Integration Tests
- [x] ~~Create e2e test framework~~
- [x] ~~Add scenario-based tests~~
- [ ] **Real LLM integration test** (expensive, optional)
- [ ] **MCP server lifecycle test** - Crash, hung process, reconnect

### 3.2 Security Tests
- [ ] **Auditor fuzzing** - Obfuscation bypass attempts
- [ ] **Symlink traversal tests**
- [ ] **Credential injection tests** for MCP

### 3.3 Load Tests
- [ ] **Concurrent operation test** - Multiple tools running
- [ ] **Large context handling** - 200k token scenarios
- [ ] **Long session performance** - Memory leaks, DB growth

### 3.4 Recovery Tests
- [ ] **Database corruption recovery**
- [ ] **SIGTERM graceful shutdown**
- [ ] **Session restore after crash**

---

## Phase 4: Observability (P2)

> Timeline: Week 4-5 | Medium Priority

### 4.1 Metrics
- [ ] **Response time histograms** - Tool execution, LLM calls
- [ ] **Token usage tracking** - Per operation breakdown
- [ ] **Error rate monitoring** - By type and severity

### 4.2 Health Checks
- [ ] **`/health` endpoint** for deployment monitoring
- [ ] **Self-diagnostics** enhancement in `/status`

### 4.3 Performance Profiling
- [ ] **Dashboard animation optimization**
  - File: `src/ui/Dashboard.tsx:148-185`
  - Currently ~100fps re-renders for sprite animation

---

## Phase 5: Documentation (P2)

> Timeline: Ongoing

### 5.1 Missing Documents
- [ ] **SECURITY.md** - Threat model, vulnerability disclosure
- [ ] **TROUBLESHOOTING.md** - Common issues and solutions
- [ ] **DEPLOYMENT.md** - Docker, systemd, K8s configs
- [ ] **API.md** - Tool schemas, error codes

### 5.2 Code Documentation
- [ ] **JSDoc for exported functions**
- [ ] **Update ARCHITECTURE.md** with event flow diagrams
- [ ] **Fix code comments** matching actual behavior

---

## Phase 6: Features (P3)

> Timeline: Future | Nice to Have

### 6.1 Subagents
- [ ] Specialized sub-agents for specific tasks
- [ ] Independent context windows
- [ ] Task-specific permissions

### 6.2 Extended Thinking
- [ ] Deep reasoning mode for complex problems
- [ ] Multiple reasoning passes

### 6.3 IDE Integration
- [ ] VS Code extension
- [ ] JetBrains plugin

### 6.4 Multi-line Input
- [ ] Support for pasting multi-line queries
- [ ] Editor mode for complex prompts

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Test Coverage | 171 tests | 300+ tests |
| `any` Types | 137 | 0 |
| E2E Scenarios | 17 | 50+ |
| Security Tests | 0 | 20+ |
| Documentation | 60% | 95% |
| Error Recovery Rate | Unknown | >95% |

---

## Version Milestones

### v0.5.0 - Production Ready
- [ ] Phase 0 complete (Security)
- [ ] Phase 1 complete (Code Quality)
- [ ] Phase 2 complete (UI/UX)
- [ ] Phase 3 complete (Testing)

### v0.6.0 - Enterprise Ready
- [ ] Phase 4 complete (Observability)
- [ ] Phase 5 complete (Documentation)
- [ ] External security audit passed

### v1.0.0 - Feature Complete
- [ ] Subagents implemented
- [ ] IDE integration available
- [ ] Web interface option

---

## Contributing

When working on roadmap items:

1. Create branch: `username-type/description`
2. Reference roadmap section in PR
3. Ensure tests pass and coverage maintained
4. Update documentation as needed
5. Use conventional commits: `feat:`, `fix:`, `docs:`

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed guidelines.
