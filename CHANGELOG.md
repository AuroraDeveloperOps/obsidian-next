# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-30

### Added
- **Security**: "Keychain-like" variable rotation system integration for secure API key management (Reference Implementation).
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
