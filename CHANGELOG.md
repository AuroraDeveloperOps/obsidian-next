# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **CommandRegistry**: New module for handling slash commands (`src/core/commands.ts`).
- **ConfigManager**: Secure configuration management using Zod schemas (`src/core/config.ts`).
- **UI Components**: `AgentLine`, `ToolOutput`, `MorphSpinner` (Ink-based).
- **EventBus**: Typed event system for Agent-UI communication.
- **Documentation**: `CONTRIBUTING.md`, `CLI_DESIGN_SYSTEM.md`, `ARCHITECTURE.md`.

### Security
- **API Key**: Removed `apiKey` from file-based config. Now exclusively reads `ANTHROPIC_API_KEY` from environment variables.

### Fixed
- **Build**: Downgraded `ink` to v4 to resolve `peerDependency` conflicts with `@inkjs/ui`.

## [0.1.0] - 2026-01-28
### Added
- Initial project structure and tooling setup.
