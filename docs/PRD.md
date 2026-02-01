# Product Requirements Document (PRD): Obsidian Next

**Project**: Obsidian Next (formerly Aurora/Obsidian)
**Status**: Active Development
**Reference**: `cliexample.MD` (Visual Baseline)

## 1. Core Philosophy
1.  **Structure over Stream**: The Agent does NOT stream raw Markdown. It emits **Structured Events** (`Reasoning`, `ToolCall`, `ChoiceRequest`) which the CLI renders.
2.  **Visual Hierarchy**:
    - **Agent Thought**: `*` Bullet points.
    - **Tool Output**: `⎿` Indented blocks (Success) / `✗` (Error).
    - **User Input**: `>` Red prompt.
3.  **Modes (Shift+Tab)**:
    - **[Default]**: Ask for permission on sensitive actions.
    - **[Plan Mode]**: Only generate tasks/plans, no execution.
    - **[Auto-Accept]**: Execute trusted tools without confirmation (High Agency).

## 2. Professional Loading State
- **Requirement**: Standard, non-distracting activity indicator.
- **Implementation**: A cyan braille spinner (`dots`) from `ink-spinner`.
- **Status Text**: Clear, static status messages (e.g., "Processing...", "Generating plan...").

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
| `/init` | Initialize configuration. |
| `/mode` | Set execution mode (auto/plan/safe). |
| `/status`| Show system status. |
| `/context`| Analyze context usage & cost (10x10 Grid). |
| `/doctor`| Debug connectivity. |
| `/clear` | Clear context window. |
| `/task` | Manage tasks. |
| `/tool` | Manual tool execution. |
| `/sandbox`| Switch execution mode to/from sandbox. |
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
- **Tech**: TypeScript, Ink, Node.js EventBus (Zero-Dep), Sandbox Runtime.
- **Diff View**:
  - unified diff format with `+`/`-` indicators.
  - Interactive "Y/n" or "Select Lines" (future).

