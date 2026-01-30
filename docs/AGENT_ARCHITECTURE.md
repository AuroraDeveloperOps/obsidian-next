# Agent Execution Architecture

## Topology

The system uses a **Supervisor-Agent** topology driven by an **Event Bus**.

```
Input -> [Supervisor] -> |-> [Commands] (e.g., /mode)
                         |-> [Agent] -> [LLM]
```

## Execution Flow

1. **User Input** is captured by `Root.tsx` and sent to the `EventBus`.
2. **Supervisor** listens for `user_input`.
3. Checks if input is a **Command** (starts with `/`).
   - If yes: Executes Command.
   - If no: Delegates to **Agent**.
4. **Agent** analyzes input, checks context, and executes logic loop.
5. **Bus** emits events (`thought`, `tool_start`, `tool_result`) back to UI.

## Execution Modes

Managed by `context.ts` and `agent.ts`:

```
/mode auto    - "Auto-Accept" (Green): Execute tools without confirmation.
/mode plan    - "Plan Mode" (Yellow): Read-only planning -> Ask Approval -> Execute.
/mode safe    - "Default" (White): Read=Auto, Write/Exec=Ask Approval.
```

## Data Structures

### Tasks (`.obsidian/tasks.md`)

Persisted Markdown file for tracking progress.

```markdown
# Implement Login Flow

Status: in_progress

## Progress
- [x] Create login.tsx
- [ ] Connect auth hook

## Context
- Modified: src/ui/login.tsx
```

### Context (`.obsidian/context.json`)

Working memory for the agent.

```json
{
  "session_id": "k9...x2",
  "mode": "safe",
  "current_task": "Implement Login Flow",
  "files_read": ["src/ui/login.tsx"],
  "files_modified": ["src/ui/login.tsx"],
  "working_set": ["src/ui/login.tsx"],
  "created_at": "2026-01-01T12:00:00.000Z"
}
```

## Tool Execution Flow

```
Agent -> ToolRegistry -> Auditor -> [Approval?] -> [Sandbox?] -> Execute
```

1. **Agent** calls tool.
2. **registry** looks up implementation.
3. **Auditor** checks `auditor.ts` rules (path traversal, dangerous commands).
4. **Approval**: If destructive & not auto-mode, ask user via `ApprovalPrompt`.
5. **Sandbox**: If `executionMode: 'sandbox'`, wrap command in `sandbox-exec`/`firejail`.
6. **Execute**: Run Node.js logic or Child Process.
7. **Result**: Return output to Agent and emit `tool_result`.
