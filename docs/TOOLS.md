# Tools & Skills Reference

## 1. Core Agents

### 1.1. The Supervisor (`src/agents/supervisor.ts`)
The top-level orchestrator.
- **Role**: Receives user input, decides which Sub-Agent or Tool to call.
- **Capabilities**: Can spawn `Planner`, `Coder`, or `Researcher`.

### 1.2. The Planner
- **Role**: Breaks down complex requests into a `task.md` representation.
- **Output**: Structured Plan Events.

## 2. Standard Tools (MCP)

### 2.1. File System (`fs`)
- **Capabilities**: `read`, `write`, `list_dir`, `grep`.
- **Safety**:
  - Writes are **sandboxed** via Prompt Permission.
  - Large reads are automatically chunked.

### 2.2. Web Search (`brave-search`)
- **Capabilities**: `search_web`.
- **Usage**: for "Research" tasks or looking up documentation.

## 3. Local Skills
Custom tools specific to Obsidian Next.

### 3.1. `codebase_search` (pgvector)
- **Description**: RAG over the local codebase.
- **Usage**: "Find where we handle auth", "How does the Spinner work?".

### 3.2. `run_command` (Sandboxed)
- **Description**: Execute shell commands.
- **Safety**: HIGH RISK. Requires standard "Choice" confirmation (1. Execute, 2. Reject).

### 3.3. `auditor_check` (System Skill)
- **Description**: Silent verification step.
- **Usage**: Automatically called by Supervisor.
- **Checks**:
  - `path_exists`: Verifies file paths before write.
  - `syntax_check`: Runs `tsc --noEmit` on code blocks before saving.

