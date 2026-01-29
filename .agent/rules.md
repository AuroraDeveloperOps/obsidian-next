# Obsidian Next AI Rules (.agent/rules.md)

**Project**: Obsidian Next
**Objective**: Build a "Figma-grade" AI Agent CLI.

## 1. Core Philosophy: Professional Standards
- **NO EMOJIS**: Documentation and UI must be strictly professional. Use `[INFO]`, `[WARN]`, `[ERROR]` tags instead.
- **Structure First**: NEVER stream raw text. Use valid JSON events.
- **Git Integration**: All changes must follow the Git Lifecycle (see below).

## 2. Git Lifecycle (Mandatory)
The Agent must adhere to this workflow for **every** task:
1.  **Branch**: `git checkout -b feature/topic-name`
2.  **Work**: Implement changes (atomic commits preferred).
3.  **Verify**: Run tests.
4.  **Commit**: `git commit -m "feat: description"` (Conventional Commits).
5.  **Merge**: `git checkout main && git merge feature/topic-name` (or open PR).

## 3. File Structure Constraints
- `src/components/`: Only UI (Ink) logic.
- `src/agents/`: Business logic only.
- `src/events/`: Single source of truth for Types.

## 4. Visual Standards
- **Clean**: Use standard ASCII (`*`, `>`, `-`, `+`). No decorative unicode characters unless essential for UI density (e.g. box drawing).
- **Colors**: Cyan for User Input, Dim Gray for Agent Thought, Green for Approvals.

