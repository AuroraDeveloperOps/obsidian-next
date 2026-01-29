# Agent Execution Architecture

## Execution Modes

```
/mode auto    - Execute without confirmation (yolo)
/mode plan    - Think -> Show Plan -> Approve -> Execute
/mode safe    - Auto for reads, approval for writes (default)
```

## Agent Loop

```
USER INPUT
    |
    v
[ANALYZE] - Parse intent, check context
    |
    v
[PLAN] - Break into steps, identify tools
    |
    v
[APPROVE?] - If plan/safe mode, show plan, wait for Y/N
    |
    v
[EXECUTE] - Run tools, update task progress
    |
    v
[VERIFY] - Check results, run tests if needed
    |
    v
[REPORT] - Terse summary, update tasks.md
```

## File Structure

```
.obsidian/
  tasks.md        # Current task tracking
  context.json    # Working memory
  config.json     # User settings (existing)
  history.json    # Conversation (existing)
```

## tasks.md Format

```markdown
# Current Task
Implement user authentication

## Progress
- [x] Read existing auth files
- [x] Create auth.ts module
- [ ] Add login endpoint
- [ ] Add tests

## Context
- Modified: src/auth.ts, src/routes.ts
- Tests: pending
```

## context.json Format

```json
{
  "session_id": "abc123",
  "mode": "safe",
  "files_read": ["src/index.ts", "src/auth.ts"],
  "files_modified": ["src/auth.ts"],
  "current_task": "Implement user authentication",
  "working_set": ["src/auth.ts", "src/routes.ts"]
}
```

## Tool Execution Flow

```
TOOL CALL
    |
    v
[AUDIT] - Check if allowed (auditor.ts)
    |
    v
[APPROVE?] - If write/delete in safe mode
    |
    v
[SANDBOX?] - Wrap if sandbox enabled
    |
    v
[EXECUTE] - Run tool
    |
    v
[TRACK] - Update context.json
    |
    v
[RESULT] - Return to LLM
```

## Mode Behaviors

### Auto Mode
- All tools execute immediately
- No confirmation prompts
- Dangerous, but fast

### Plan Mode
- LLM generates full plan first
- Shows plan to user with file list
- User approves with Y or rejects with N
- Only then executes
- Good for complex tasks

### Safe Mode (Default)
- Read tools: auto-execute
- Write/edit/delete: show diff, require approval
- Bash: depends on command (auditor patterns)

## Implementation Files

```
src/
  core/
    agent.ts      # Main agent loop (NEW)
    planner.ts    # Plan generation (NEW)
    context.ts    # Memory management (NEW)
    tasks.ts      # Task tracking (NEW)
    mode.ts       # Mode management (NEW)
    auditor.ts    # Security (EXISTS)
    tools.ts      # Tool execution (EXISTS)
    llm.ts        # LLM client (EXISTS)
  agents/
    supervisor.ts # Orchestrator (REFACTOR)
```
