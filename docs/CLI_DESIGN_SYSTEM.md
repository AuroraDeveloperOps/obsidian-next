# Obsidian Next Design System

Based on `cliexample.MD`.

## 1. The Grid Layout
All output is strictly key-value or bullet-aligned.

### 1.1. Agent Bullet (`*`)
Primary indicator of Agent activity/thought.
```
* Let me check the current task list...
```

### 1.2. Tool Output (`⎿`)
Indicates the result of a tool call (`src/components/ToolOutput.tsx`).

**Standard (Success)**:
```
⏺ bash(ls -la)
  ⎿  total 84
     drwxr-x ...
```

**Error**:
```
⏺ bash(mkdir /root/test)
  ✗  Error: Exit code 1
     mkdir: cannot create directory '/root/test': Permission denied
```

### 1.3. The Prompt (`>`)
Red color (`#FF0000`) for user input area.
```
> check the api status
```

## 2. The Spinner
**Implementation**: `src/components/MorphSpinner.tsx`
**Visual**: Cyan Braille Dots (`⠋`, `⠙`, `⠹`, `⠸`, `⠼`, `⠴`, `⠦`, `⠧`, `⠇`, `⠏`).
**Status Text**:
- `Processing...`
- `Generating plan...`
- `Executing tools...`

## 3. Scenarios & Components

### 3.1. Context & History
Compressed history view on startup.

### 3.2. Structured Choices
When the agent needs a decision (via `ChoicePrompt`).
```
  Next step options:

  1. Complete Phase 5 - Implement Resource Quotas
  2. Skip to Phase 6 - Defer quotas
  3. Fix health checks - The management-api shows unhealthy

  What's the priority?
```

### 3.3. Permission / Confirmation
**Diff View (File Edit)**:
Uses `ApprovalPrompt` component. Shows diff of pending changes.
```
* The agent wants to edit `src/index.ts`:

  364 -      test: ["CMD", "wget", "-q", "localhost"]
  364 +      test: ["CMD", "wget", "-q", "localhost/api"]

  1. Approve
  2. Reject (Press Tab to add reason)
```

### 3.4. Footer (StatusBar)
Always visible at the bottom (Ink `Box` with flex-between).
```
[ default ] [ Context: 0.0k / 200k (0%) ] [ Model: Claude 4.5 Sonnet ]
```
- **Mode**: "[ default ]" (White), "[ plan mode ]" (Yellow), "[ auto-accept ON ]" (Green).
- **Context**: Current usage / 200k limit (Percentage).

### 3.5. Text Input Prompts
For masked input (API keys) and interactive setup (`TextInputPrompt.tsx`).
```
Enter your Anthropic API key:
> sk-ant-****************************
```

### 3.6. Session Summary
Shown on `/exit` with activity stats.
```
==================================================
SESSION SUMMARY
==================================================

Session ID: abc123
Duration:   1h 23m

[Activity]
  Files read:     12
  Files modified: 3
  Tasks done:     2
  Tasks pending:  1

[Cost]
  Session total:  $0.0847

Session saved. Resume with: /resume abc123
==================================================
```

### 3.7. Session View (Menu)
Interactive TUI for managing saved sessions (`src/ui/views/SessionView.tsx`).

```
┌────────────────────────────────────────────────────────┐
│ Saved Sessions                                         │
├────────────────────────────────────────────────────────┤
│ ID                   Date                     Task     │
│ > ml2vm8fw...        1/31, 5:22 PM            Plan...  │
│   k9s8d7f6...        1/30, 4:00 PM            Fix...   │
│                                                        │
├────────────────────────────────────────────────────────┤
│ Enter to resume · D to delete · Esc to close           │
└────────────────────────────────────────────────────────┘
```
