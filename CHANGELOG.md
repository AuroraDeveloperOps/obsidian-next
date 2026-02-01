# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.4] - 2026-02-01

### Fixed
- **Usage Tracking**: Fixed "System/Tools" usage display showing `0.0k` on cache misses. Now strictly tracks creation tokens to ensure accurate visibility.

### Documentation
- **New Guide**: Added `docs/CONTEXT.md` detailing the Smart Context architecture.
- **Updates**: Refined `README.md` and `INDEX.md` to reflect semantic summarization capabilities.

## [0.4.3] - 2026-02-01

### Added
- **100x Context Architecture**:
  - **High-Fidelity Grid**: 10x10 visualization (`⛁`) in `/context` and usage views.
  - **200k Token Strategy**: Tiered warning (160k), pruning (180k), and hard stop (196k) limits.
  - **Memory Manager**: Persistent session context tracking (`src/core/memory.ts`).
- **Resume 2.0**:
  - Full restoration of session costs, token usage, and context stats.
  - Fixed sync issues where context appeared as 0.0k after resumption.

### Changed
- **Commands**: Deprecated `/cost` and `/usage` in favor of unified `/context` command.
- **Documentation**: Updated all docs to reflect 'Claude 4.5' model baseline.

## [0.4.2] - 2026-02-01

### Security Hardening
- **MCP API Keychain**: Replaced plaintext `mcp.json` storage with System Keychain integration.
  - Added `KeyManager` support for multi-account keys (e.g. `obsidian-mcp:context7`).
  - `MCPManager` now securely injects keys at runtime via `secureEnv`.
  - `MCPView` Setup screen now writes directly to Keychain.

### Changed
- **Dependency Cleanup**: Removed unused database drivers (`prisma`, `pg`, `ioredis`, `bullmq`) to enforce local-first architecture.
- **Testing**: Added `verify-security.ts` script for keychain validation.
- **Documentation**: Updated `README.md`, `PRD.md`, and `TOOLS.md` to reflect the removal of database dependencies and the new v0.4.2 security baseline.

## [0.4.1] - 2026-01-31

### Added
- **Interrupt System**: Press `Escape` key to immediately stop agent thought generation or tool execution.
- **TUI Polish**:
  - Darker code block backgrounds (`#151515`) for better contrast.
  - "Glitter" animation for active thinking states.
  - Removed emojis from test script outputs for cleaner logs.

### Fixed
- **MCP Stability**:
  - **Freeze Fix**: Force-kill transport processes (`SIGKILL`) on disconnect to prevent UI hangs.
  - **API Key Audit**: Trim whitespace from environment variables and inputs to prevent auth errors.
- **Sandbox**: Robust OS-level isolation fixes
  - Fixed syntax error in macOS `sandbox-exec` profile (`sys*` -> `syscall-unix`)
  - Improved runtime diagnostics and fallback recovery logic
  - Integrated `@vscode/ripgrep` to ensure dependency availability

- **Stability**: Critical Persistence Fixes
  - **Session Leak**: Fixed `Agent.init` to properly wipe history on fresh starts, preventing "ghost" sessions.
  - **Sticky Config**: Fixed `workspaceRoot` persisting locally; now correctly respects `process.cwd()` for global installs.
  - **Production Save**: Fixed `Root.tsx` to properly await `session.save()` during UI exit.

### Added
- **Session UI**: Interactive `/resume` menu
  - Browse saved sessions with arrow keys
  - Delete sessions with `D` or `Delete`
  - Resume with `Enter`
- **Dependencies**: Bundled `@vscode/ripgrep` to stabilize primary sandbox runtime

### Changed
- **Task System**: Enforced "Fresh Session" semantics. `npm start` now auto-archives old tasks to `.obsidian/archive`. Use `/resume` to keep active tasks.
- **UI Design**: Aligned with "Obsidian Pro" specifications
  - **Chat**: Optimized tool execution format (`⏺`) and bullet styling (`●`)
  - **Footer**: Added live task progress indicator (`Tasks (x/y open)`)
  - **Animation**: "Thinking..." indicator is now persistent and sticky at the bottom
  - **Dashboard**: Sprite animation now pauses when agent is idle to reduce visual noise


## [0.3.1] - 2026-01-31

### Added
- **UI Safety**: Global confirmation intercepts for destructive commands (`/clear`, `/exit`)
- **Settings Safeguards**: Local warnings for Auto Mode, key backend switching, and permission clearing

### Changed
- **Design System**: "Red Minimalist" overhaul - removed borders, standardized red accents
- **Typography**: Cleaner header styling (`[ Title ]`) and unified component layouts
- **Refactors**: `DoctorView`, `HelpView`, `UsageView`, `TaskView`, and `SettingsMenu` updated to new style

- **Session Management**: Persistent sessions for long-running tasks
  - `/exit` - Save session state (context, history, tasks) and exit gracefully
  - `/resume` - List and restore saved sessions
  - `/resume --last` - Quick restore of most recent session
  - Sessions stored in `.obsidian/sessions/`

- **Interactive Init**: `/init` command with guided setup
  - Masked API key input
  - Model selection menu
  - .env file detection with migration warning
  - `--reset` flag for reconfiguration

- **Diff Viewer**: `/diff` command for file change tracking
  - List recent file modifications
  - View line-level diffs with additions/deletions
  - Auto-stored when files are modified

- **Enhanced Dashboard**: Improved UI components
  - Text input prompts with masking support
  - Choice selection menus
  - Session status indicators

### Changed

- **LLM Client**: Integrated with KeyManager for secure key retrieval
- **Config**: Deep merge now includes new session settings
- **Commands**: Added 3 new commands (init, exit, resume, diff)

### Fixed

- **Agent Line**: Improved rendering for long content
- **Settings Menu**: Better category organization

## [0.3.0-security] - 2026-01-30

### Added

- **KeyManager**: Secure API key storage system (`src/core/keyManager.ts`)
  - macOS Keychain support via `security` CLI
  - Linux secret-tool support via libsecret
  - Encrypted file fallback with AES-256-GCM
  - Machine-specific key derivation
  - Auto-rotation detection for long sessions

- **PII Redactor**: Real-time sensitive data protection (`src/core/redactor.ts`)
  - 14 built-in patterns (email, phone, SSN, credit cards, API keys, passwords, JWT, etc.)
  - Configurable per-pattern enable/disable
  - Allowlist support for specific values
  - Integrated with LLM tool results and context

- **Audit Logging**: Complete accountability system (`src/core/auditLog.ts`)
  - JSON-formatted logs at `.obsidian/audit.log`
  - Command execution tracking
  - File operation logging
  - Approval decision recording
  - Auto-rotation at 10MB

- **Settings Menu**: Interactive UI for configuration (`src/components/SettingsMenu.tsx`)
  - Arrow key navigation
  - Toggle switches for booleans
  - Category-based organization
  - Permission list management

- **Security Settings Schema**: New settings section
  - `security.piiRedaction`: Enable/disable PII redaction
  - `security.auditLogging`: Enable/disable audit logging
  - `security.keyBackend`: Key storage backend selection

- **Tests**: Comprehensive security test coverage
  - `tests/redactor.test.ts`: 20 PII redaction tests
  - `tests/keyManager.test.ts`: 8 key management tests
  - `tests/auditLog.test.ts`: 14 audit logging tests
  - Updated `tests/auditor.test.ts`: 13 approval tests

### Fixed

- **Approval Enforcement**: Commands with `requiresApproval` now properly block execution
- **Safe Mode**: Returns `approved: false` when approval is required (was bypassing)
- **Edit Tool**: Now uses `replaceAll()` to replace all occurrences (was only first)
- **Undo System**: Properly initialized with session ID in agent startup
- **Phone Pattern**: Fixed false positives in PII redactor matching numeric strings

### Changed

- **Auditor**: Added regex patterns for complex dangerous commands (curl|sh, wget|bash)
- **Settings**: Deep merge now includes security section
- **LLM Client**: Integrated with KeyManager and Redactor
- **Agent**: Integrated with audit logging and redactor

### Security

- All tool output is now redacted before sending to LLM
- Context summaries are redacted for PII
- Dangerous pipe-to-shell patterns blocked via regex
- Complete audit trail for all operations

## [0.2.0] - 2026-01-30

### Added

- **Workspace**: Dedicated `workspace/` environment for Polyoxy benchmarking and evaluation.
- **Documentation**: Comprehensive directory index at `docs/INDEX.md`.
- **MCP**: Experimental MCP configuration (`mcp-config.example.json`).

### Changed
- **License**: Switched to Apache License 2.0.
- **Documentation**:
  - Removed all emojis to adhere to strict professional standards.
  - Reorganized `README.md` with "Safer than whatever-bot" value proposition.
  - Updated `CONTRIBUTING.md` with strict branch naming conventions (`username-type/description`).
- **Architecture**: Clarified Supervisor-Agent topology in `docs/AGENT_ARCHITECTURE.md`.
- **UI**: Standardized tool output symbols (`⎿`) in `docs/CLI_DESIGN_SYSTEM.md`.

### Fixed
- **Cleanup**: Removed `CLAUDE.md` and other non-standard files.
- **Accuracy**: Aligned all documentation with the actual codebase implementation (Sandbox status, Tool limits).

## [0.1.0] - 2026-01-28
### Added
- Initial project structure and tooling setup.
- Core Agent logic (`src/core/agent.ts`).
- Tooling foundation (`src/core/tools.ts`).
