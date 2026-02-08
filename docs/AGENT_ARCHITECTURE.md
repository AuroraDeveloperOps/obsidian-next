# Agent Execution Architecture

## Topology

The system uses a **Supervisor-Agent** topology driven by a global **Daemon** and **Event Bus**.

```
Input -> [Frontend] -> Socket -> [Supervisor] -> |-> [Commands] (e.g., /mode)
                                                 |-> [Agent] -> [Claude 4.6]
```

## Execution Flow (The Autonomous Loop)

1. **User Input** is captured by any frontend (CLI, Web, Telegram) and sent via Socket to the Daemon.
2. **Supervisor** listens for `user_input`.
3. Checks if input is a **Command** (starts with `/`).
   - If yes: Executes Command handler.
   - If no: Delegates to **Agent**.
4. **Agent (Reasoning Phase)**: 
   - Utilizes Claude 4.6 **Adaptive Thinking**.
   - Toggles `effort: max` for complex planning.
   - Emits `thinking` blocks to UI for transparency.
5. **Agent (Execution Phase)**:
   - Identifies required tools.
   - If a tool is missing, triggers **Self-Improving Skill Loop** (`create_skill`).
6. **Bus** emits events (`thought`, `tool_start`, `tool_result`) back to all connected frontends.

## Execution Modes

Managed globally by `context.ts` and `agent.ts`:

```
/mode auto    - "Autonomous" (Green): Execute tools without confirmation.
/mode plan    - "Architect" (Yellow): Read-only planning -> Ask Approval -> Execute.
/mode safe    - "Guardian" (White): Read=Auto, Write/Exec=Ask Approval.
```

## Data Structures (SQLite Backend)

All state is now stored in `~/.obsidian-next/state.db`.

### Tasks (Table: `tasks`)
Structured project tracking with subtasks and context metadata.

### Context (Table: `working_set`)
Time-decayed working memory for the agent. Prioritizes recent and relevant files for the 1M token context window.

### Semantic Memory (Table: `memos` + `sqlite-vec`)
Long-term facts, patterns, and decisions indexed for vector search.

## Tool Execution Flow

```
Agent -> ToolRegistry -> Auditor -> [Approval?] -> [Sandbox?] -> Execute
```

1. **Agent** calls tool.
2. **Registry** looks up implementation (built-in or self-generated skill).
3. **Auditor** checks global safety rules relative to `workspaceRoot`.
4. **Approval**: If destructive & not auto-mode, ask user via UI or Telegram.
5. **Sandbox**: Wrap command in OS-level isolation.
6. **Execute**: Run Node.js logic or Child Process within the Daemon context.
7. **Result**: Return output, update `Working Set` scores, and emit `tool_result`.

## Self-Improving Skill Loop
1. **Identify**: Agent detects a capability gap.
2. **Draft**: Agent writes a new TypeScript tool in `~/.obsidian-next/skills/`.
3. **Verify**: Agent generates and runs a sandboxed unit test.
4. **Register**: Daemon dynamically imports and enables the new tool.
