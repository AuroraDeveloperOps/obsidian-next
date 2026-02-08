# Contributing to Obsidian Next

Thank you for your interest in contributing to **Obsidian Next**.
This project adheres to **Strict Professional Engineering Standards**.

## 1. Core Principles

**Obsidian Next is not a toy.** It is a high-assurance agentic runtime.
All contributions must demonstrate:
- **Type Safety**: No `any`. Strict TypeScript configuration.
- **Determinism**: Agents must use typed events, not unstructured strings.
- **Security**: Zero-Trust architecture. No checked-in secrets.

## 2. Communication Standards

- **No Emojis**: Keep documentation, commits, and PR descriptions professional.
- **Clear English**: Use precise technical language.
- **Context**: Explain *why* a change is necessary, not just *what* it does.

## 3. Git Workflow

We strictly follow the protocol defined in **[docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)**.

### Quick Reference

**Branch Naming**:
- `user-type/description`
- Example: `polyoxy-feat/context-grid`

**Commit Messages**:
- [Conventional Commits](https://www.conventionalcommits.org/) are enforced.
- Example: `feat(core): implement 10x10 context grid`

## 4. Development Loop

1.  **Install**: `npm install`
2.  **Build**: `npm run build`
3.  **Test**: `npm test` (Must pass 100%)
4.  **Dev**: `npm start` (Runs the CLI in dev mode)

## 5. Directory Structure Overview

- `src/core/`: The "Brain". EventBus, Auditor, Agent Loop.
- `src/commands/`: Slash command handlers (`/init`, `/context`).
- `src/ui/`: Ink-based Terminal UI components.
- `src/mcp/`: Model Context Protocol integration.
- `tests/`: Vitest suite (Unit & Integration).

## 6. Pull Request Process

1.  Ensure all tests pass.
2.  Update documentation for any API changes.
3.  Fill out the **Pull Request Template** completely.
4.  Request review from `@aurora-foundation/maintainers`.

See **[docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)** for the complete guide.
