# Tool Execution & Skill Mastery

Obsidian Next features a robust, auditable tool execution system (`src/core/tools.ts`) that operates globally relative to your configured `workspaceRoot`.

## Built-in Tools

### bash
Execute shell commands in the current workspace.
- **Context**: Executed in `cfg.workspaceRoot`.
- **Safety**: Audited by the global `Auditor`. Dangerous patterns like `rm -rf /` are blocked at the source.
- **Limits**: 30s timeout, 1MB output buffer.

### read / write / edit
File system primitives for the autonomous loop.
- **Line Numbers**: `read` automatically numbers lines for precise targeting.
- **Undoable**: All `write` and `edit` operations are recorded in the global `UndoManager` and can be reverted via `/undo`.
- **Verification**: `edit` requires an exact match for the `search` string to prevent accidental corruption.

### list / grep / glob
Discovery tools for large codebases.
- **1M Token Optimized**: These tools feed the "Working Set" scoring algorithm to keep the agent's context relevant.
- **Exclusion**: Always ignores `node_modules`, `.git`, and build artifacts.

### web_fetch
Secure URL content retrieval.
- **Safeguards**: Blocks `localhost` and private IP ranges to prevent internal port scanning.
- **Distillation**: Automatically strips HTML boiler-plate to save tokens.

### memory
Interface for the Semantic Knowledge Bank.
- **Types**: `user_preference`, `project_fact`, `decision_log`, `learned_pattern`.
- **Search**: Powered by `sqlite-vec` for semantic similarity (recall of *concepts*, not just *keywords*).

---

## Autonomous Tools (Skill Expansion)

### create_skill [AUTONOMOUS ONLY]
Allows the agent to expand its own toolbox when it hits a capability gap.
1.  **Draft**: Writes a new TypeScript tool definition in `~/.obsidian-next/skills/`.
2.  **Test**: Generates a unit test and executes it in the sandbox.
3.  **Deploy**: If tests pass, the tool is dynamically loaded into the `ToolRegistry`.

---

## Global Agent Commands

| Command | Description |
|:---:|---|
| `/schedule` | Create background cron-jobs (e.g., `0 9 * * * system:audit`). |
| `/memory export` | Save the agent's brain to a human-readable `MEMORY.md`. |
| `/workspace` | Move the agent's focus between different project roots. |
| `/pilot` | Enable secure GUI automation (Computer Use). |

## Architecture
Tools are registered in a global `DynamicToolRegistry` and wrapped with:
1. **Auditor**: Global safety policy enforcement.
2. **Sandbox**: Kernel-level runtime isolation.
3. **Redactor**: Final PII check on tool output before returning to the LLM.
