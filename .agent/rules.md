# Obsidian Next AI Rules (.agent/rules.md)

**Project**: Obsidian Next
**Objective**: Build a "Figma-grade" AI Agent CLI.

## 1. Core Philosophy: Structure First
- **NEVER** write code that directly prints to `stdout` or `console.log`.
- **ALWAYS** use the `EventBus` to emit typed events (`thought`, `tool_output`, `error`).
- **UI Components**: Use **Ink** components for everything. Do not use raw ASCII unless wrapped in a Component.

## 2. File Structure Constraints
- `src/components/`: Only UI (Ink) logic. No business logic.
- `src/agents/`: Only formatting/logic. No UI code.
- `src/events/`: The Single Source of Truth for `AgentEvent` types.

## 3. The "Clean Steps" Protocol
When implementing features:
1.  **Plan**: Check `task.md` and `PRD.md`.
2.  **Atomic**: Do not mix "Refactoring" with "Feature Work".
3.  **Verify**: Run `npm test` after **every** significant change.

## 4. Visual Standards
- **Spinners**: Must be the "Morphing" type (`▖` -> `▘`).
- **Lists**: Must be numbered `1.`, `2.`.
- **Colors**: Cyan for User, Dim for Thought, Green for Success.
