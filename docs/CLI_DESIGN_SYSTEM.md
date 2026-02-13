# Obsidian Next Design System

Based on the **Autonomous Engineering Gateway** visual baseline.

## 1. The Proactive Terminal Layout
All output is strictly structured to support high-agency engineering.

### 1.1. Reasoning Trace (Thinking Block)
Primary indicator of Agent's internal adaptive thinking (Claude 4.6).
```
* Thinking (effort: max)...
  > Analyzed 14 files in the working set.
  > Identified a race condition in the lane queue.
  > Designing a mutex-based fix for src/core/bus.ts.
```

### 1.2. Agent Bullet (`*`)
Indicator of final decisions or direct communication.
```
* I've prepared a plan to fix the race condition. View /task for details.
```

### 1.3. Tool Output (`⎿`)
Indicates the result of an autonomous action.

**Success**:
```
⏺ bash(npm test)
  ⎿  PASS tests/core/bus.test.ts
     ✓ should handle concurrent events (142ms)
```

**Autonomous Error (Self-Correction Triggered)**:
```
⏺ edit(src/core/bus.ts)
  ✗  Error: Search string not found.
* Thinking (effort: low)...
  > Search string mismatch likely due to stale read. Re-reading file...
⏺ read(src/core/bus.ts)
```

## 2. The Status Bar (Footer)
Visible across all connected interfaces.
```
[ autonomous ] [ Context: 142k / 1M (14%) ] [ Model: Opus 4.6 ] [ Daemon: Active ]
```
- **Mode**: "[ guardian ]" (White), "[ architect ]" (Yellow), "[ autonomous ]" (Green).
- **Context**: 1M token mastery grid tracking.
- **Daemon**: Connectivity status to the background service.

## 3. Advanced Components

### 3.1. 1M Token Mastery Grid
A high-fidelity visualization of the massive context window.
- `⛁` **Cached Prefix**: System Persona + Codebase Schema (90% cost reduction).
- `⛁` **Active Working Set**: Recently modified files.
- `⛶` **Free Window**: Remaining space in the 1M token window.

### 3.2. Pilot Mode Overlay
(Conceptual) Red border and blinking indicator when the agent takes GUI control.
```
[ PILOT MODE ACTIVE ] [ EVALUATING SCREENSHOT... ]
```

### 3.3. Multi-Channel Prompts
Interactive setup for remote gateways.
```
/init-telegram
Enter Bot Token:
> 123456789:ABCDEF... (Masked)
Whitelisting User ID: 987654321 [Verified]
```

## 4. Keyboard Shortcuts

| Shortcut | Action |
|----------|-------------|
| `Shift+Tab`| Cycle through modes (Direct, Plan, Safe) |
| `PageUp`   | Scroll up in chat history |
| `PageDown` | Scroll down in chat history |
| `Ctrl+T`   | Open Task View |
| `Ctrl+K`   | Open Command Palette |
| `Escape`   | Stop agent execution |

---

## 5. Daily Log Preview
Shown on `/status` to summarize background heartbeat activity.
```
Today's Log: 2026-02-07.md
- 02:00: Nightly Security Audit [No vulnerabilities]
- 04:30: Codebase Indexing [Updated MAP.md]
- 09:15: Proactive Test Run [1 failure in mcp-registry]
```
