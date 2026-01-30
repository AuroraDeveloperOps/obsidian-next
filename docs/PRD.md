# Product Requirements Document (PRD): Obsidian Next

**Project**: Obsidian Next (formerly Aurora/Obsidian)
**Status**: Final
**Reference**: `cliexample.MD` (Visual Baseline)

## 1. Core Philosophy
1.  **Structure over Stream**: The Agent does NOT stream raw Markdown. It emits **Structured Events** (`Reasoning`, `ToolCall`, `ChoiceRequest`) which the CLI renders.
2.  **Visual Hierarchy**:
    - **Agent Thought**: `*` Bullet points.
    - **Tool Output**: `>` Indented blocks.
    - **User Input**: `>` Cyan prompt.
3.  **Modes (Shift+Tab)**:
    - **[Default]**: Ask for permission on sensitive actions.
    - **[Plan]**: Only generate tasks/plans, no execution.
    - **[Auto Accept]**: Execute trusted tools without confirmation (High Agency).

## 2. The "Morphing" Spinner
- **Requirement**: "Morphing box or circle" (from `cliexample.MD`).
- **Implementation**: A high-fidelity ASCII animation sequence that cycles shapes:
  `⠶` -> `⠲` -> `⠴` -> `⠘` (or similar) combined with "Creative Verbs":
  - "Churning..."
  - "Brewing..."
  - "Cogitating..."

## 3. Structured Interaction
The Agent must support a `Choice` tool that forces the UI to render a selectable list.

**Tab-to-Context**:
- If a user selects a "Reject" or "Modify" option, they can press `TAB`.
- This opens an input line.
- The input is sent as a `UserMessage` to the Event Bus *before* the `ToolResult`.
- The Agent sees: `[User rejected tool call with reason: "Variable name is wrong"]`.

**Example**:
```json
{
  "type": "choice",
  "question": "Permission Request",
  "options": [
    { "id": "1", "label": "Approve" },
    { "id": "2", "label": "Reject", "allow_context": true }
  ]
}
```

## 4. Slash Commands (Open Source Standard)
We must implement a `CommandRegistry` to handle these local-only ops.

| Command | Description |
|---------|-------------|
| `/help` | Show available commands. |
| `/init` | Initialize `.obsidian/config.json`. |
| `/config`| View/edit configuration settings. |
| `/models`| List/Select models (Claude, Ollama, OpenAI). |
| `/clear` | Clear context window (start fresh). |
| `/doctor`| Debug connectivity and tools. |
| `/cost` | **Session** cost. Current tokens and price for *this* interaction. |
| `/usage` | **Historical** usage. Yearly, Monthly, Daily breakdown of costs. |
| `/status`| Show system status (mode, sandbox, context). |
| `/mode` | Set execution mode (auto/plan/safe). |
| `/task` | View/manage current task progress. |
| `/tool` | Execute tools manually (power users). |
| `/sandbox`| Toggle sandbox mode for secure execution. |
| `/undo` | Undo recent file changes. |

**Note**: Git operations (commit, push, etc.) are handled by the AI via the bash tool.


## 5. Strict Event Protocol (JSON Schema)
To ensure the AI "adheres to these outputs", the Supervisor logic must enforce this JSON schema for **all** agent emissions.

```typescript
type AgentEvent =
  | { type: "thought"; content: string; hidden?: boolean }
  | { type: "tool_start"; tool: string; args: string }
  | { type: "tool_result"; tool: string; output: string; isError?: boolean }
  | { type: "choice_request"; question: string; options: Option[] }
  | { type: "approval_request"; context: string; diff?: string }
  | { type: "done"; summary: string };

// The AI is FORBIDDEN from streaming raw text outside of "content" fields.
```

## 6. Architecture Specs
- **Folder**: `obsidian/obsidian-next`
- **Tech**: TypeScript, Ink, Redis (Queue), isolated-vm (Safety).
- **Diff View**:
  - unified diff format with `+`/`-` indicators.
  - Interactive "Y/n" or "Select Lines" (future).

