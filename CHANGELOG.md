# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- **Documentation**: Comprehensive directory index at `docs/README.md`.
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
