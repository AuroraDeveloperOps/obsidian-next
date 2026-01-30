# Obsidian Next Architecture

## 1. Directory Structure
```
obsidian-next/
├── .agent/              # AI Rules & Skills
├── .obsidian/           # Runtime data (config, context, history)
├── docs/                # PRD, Design, Research
├── src/
│   ├── agents/          # Logic (Supervisor)
│   ├── commands/        # Slash command handlers
│   ├── components/      # Ink UI (Spinner, Prompts, DiffView)
│   ├── core/
│   │   ├── agent.ts     # Main agent loop
│   │   ├── auditor.ts   # Security checks
│   │   ├── bus.ts       # EventBus (TypedEventEmitter)
│   │   ├── commands.ts  # Command registry
│   │   ├── config.ts    # Config loader
│   │   ├── context.ts   # Working memory
│   │   ├── history.ts   # Conversation history
│   │   ├── llm.ts       # Anthropic API client
│   │   ├── sandbox.ts   # Sandbox execution
│   │   ├── tasks.ts     # Task tracking
│   │   ├── tools.ts     # Tool execution framework
│   │   ├── undo.ts      # Undo system
│   │   └── usage.ts     # Cost tracking
│   ├── events/          # Event type definitions
│   ├── ui/              # Main UI components (Root, Dashboard)
│   └── index.ts         # CLI Entry Point
├── tests/               # Vitest tests
└── package.json
```

## 2. The Event Bus (Core Nervous System)
The entire app is driven by a `TypedEventEmitter`.

```typescript
// src/core/bus.ts
import { EventEmitter } from 'events';
import { AgentEvent } from './types';

export class EventBus extends EventEmitter {
  emit(event: AgentEvent) { super.emit('event', event); }
  on(cb: (e: AgentEvent) => void) { super.on('event', cb); }
}
```

## 3. The Supervisor Loop
1.  **Input**: User types in `InputArea` (Ink).
2.  **Dispatch**: `Supervisor` receives text.
3.  **Think**: Supervisor emits `{ type: 'thought', content: 'Analyzing...' }`.
4.  **Audit**: "The Auditor" checks intent against Safety Rules (e.g., "Deleting Root?").
5.  **Delegate**: Supervisor pushes job to `Redis`.
6.  **Worker**:
    - Picks up job.
    - Emits `{ type: 'tool_start', ... }`.
    - Execs tool.
    - Emits `{ type: 'tool_result', ... }`.
7.  **Render**: `App.tsx` listens to Bus and updates state.

## 4. Tools (8 Available)
| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands (auditor-protected) |
| `read` | Read file contents with line numbers |
| `write` | Create new files |
| `edit` | Search/replace in existing files |
| `list` | List directory contents |
| `grep` | Search file contents with regex |
| `glob` | Find files by pattern |
| `web_fetch` | Fetch content from URLs |

## 5. MCP Integration (Planned)
- `@modelcontextprotocol/sdk` is installed but not yet wired up
- Tools are currently custom implementations
- Future: Expose tools as MCP server for LSP integration

## 6. Automation & CI
- **GitHub Actions**: Run `vitest` on Push
- **Release**: `pkg` bundler to create binaries
