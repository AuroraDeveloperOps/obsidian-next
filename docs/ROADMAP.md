# Obsidian Next - Roadmap v0.5.0

> Updated: 2026-02-07 | Status: Autonomous Transformation

This roadmap follows the successful implementation of the **Always-On Daemon** and **Claude 4.6** integration.

---

## Current State: v0.4.6

**Maturity:** 8.5/10 (Architectural shift complete)

### Features Implemented
- [x] Global State Architecture (`~/.obsidian-next/`)
- [x] Always-On Heartbeat Scheduler
- [x] Claude 4.6 Adaptive Thinking & 1M Context Support
- [x] Semantic Memory Bank (`sqlite-vec`)
- [x] Bidirectional Markdown Sync (`MEMORY.md`)

---

## Phase 4: Self-Improving Autonomy (P0)

> Timeline: This Month

### 4.1 Skill Expansion
- [ ] **Autonomous `create_skill` Tool** - Allow the agent to write its own TypeScript tools.
- [ ] **AST Sanitization** - Verify self-generated code for security risks before execution.
- [ ] **Dynamic Hot-Reload** - Load new tools into the registry without daemon restart.

### 4.2 Proactive Ghost Work
- [ ] **Background Code Indexing** - Build a persistent semantic map of all user codebases.
- [ ] **Nightly Audits** - Proactively search for technical debt and security vulnerabilities.

---

## Phase 5: The Global Gateway (P1)

> Timeline: Next 30 Days

### 5.1 Remote Connectivity
- [ ] **Telegram Bot Bridge** - First-class mobile interaction and remote approvals.
- [ ] **Unix Domain Socket Hardening** - Multi-client lane queue management.

### 5.2 Pilot Mode Mastery
- [ ] **Visual Evaluation Loop** - Native screenshot comparison for GUI tasks.
- [ ] **Visual Redaction** - Blur sensitive UI elements in the vision pipeline.

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
