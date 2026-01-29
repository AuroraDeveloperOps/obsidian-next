# Obsidian Next Architecture

## 1. Directory Structure
```
obsidian-next/
├── .agent/              # AI Rules & Skills
├── docs/                # PRD, Design, Research
├── src/
│   ├── agents/          # Logic (Supervisor, Planner)
│   ├── components/      # Ink UI (Spinner, Tables)
│   ├── core/
│   │   ├── bus.ts       # EventBus (RxJS/EventEmitter)
│   │   ├── config.ts    # Config Loader
│   │   └── queue.ts     # Redis Queue Wrapper
│   ├── app.tsx          # Ink Entry Point
│   └── index.ts         # CLI Entry Point
├── tests/               # Playwright/Vitest
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

## 5. Memory Architecture (Zero Context Loss)
- **Context Slices**: Dynamic subsets of files.
  - `SliceManager` class maintains `Map<string, FileContent>`.
  - **Auto-Slicing**: If user asks about "Login", `pgvector` finds relevant files and auto-mounts the `@Auth` slice.
- **Knowledge Chunks**: Code blocks are hashed and stored in Postgres.


## 4. Automation & CI
- **GitHub Actions**: Run `vitest` on Push.
- **Release**: `pkg` bundler to create binaries.
