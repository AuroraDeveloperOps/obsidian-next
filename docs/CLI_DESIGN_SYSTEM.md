# Obsidian Next Design System

Based on `cliexample.MD`.

## 1. The Grid Layout
All output is strictly key-value or bullet-aligned.

### 1.1. Agent Bullet (`*`)
Primary indicator of Agent activity/thought.
```
* Let me check the current task list...
```

### 1.2. Tool Output (`>`)
Indicates the result of a tool call.
**Standard**:
```
* Bash(ls -la)
  > total 84
     drwxr-x ...
```
**Error**:
```
* Bash(mkdir /root/test)
  > Error: Exit code 1
     mkdir: cannot create directory '/root/test': Permission denied
```

### 1.3. The Prompt (`❯`)
Cyan color.
```
❯ check the api status
```

## 2. The Spinner ("The Morph")
**Animation**: `[=...]`, `[==..]`, `[===.]`, `[====]` (Classic Progress)
**Status Text**:
- `[=..] Processing...`
- `[==.] Planning...`
- `[===] Reasoning...`
- `[====] Traversing...`

## 3. Scenarios & Components

### 3.1. Context & History
Compressed history view on startup.
```
╭─── Obsidian Next v0.1.0 ───────────────────────────────────────────────╮
│                                              │ Tips                    │
│           Welcome back Polyoxy!              │ ✔ Run /init to setup    │
│                                              │ ─────────────────────── │
│              [ASCII ART]                     │ Recent activity         │
│                                              │ No recent activity      │
│   Obsidian Pro · polyoxy@example.com         │                         │
│             ~/obsidian-next                  │                         │
╰────────────────────────────────────────────────────────────────────────╯
```

### 3.2. Structured Choices
When the agent needs a decision.
```
  Next step options:

  1. Complete Phase 5 - Implement Resource Quotas
  2. Skip to Phase 6 - Defer quotas
  3. Fix health checks - The management-api shows unhealthy

  What's the priority?
```

### 3.3. Permission / Confirmation
**Diff View (File Edit)**:
```
* The agent wants to edit `src/index.ts`:

  364 -      test: ["CMD", "wget", "-q", "localhost"]
  364 +      test: ["CMD", "wget", "-q", "localhost/api"]

  1. Approve all changes
  2. Reject (Press Tab to add reason)
  3. View Full Diff

  > 2 [TAB]
  > Reason: The path should be /api/v1 not /api_
```

**Dangerous Command**:
```
* The agent wants to run:
  > sudo rm -rf /tmp/test

  [!] This command runs as ROOT.

  1. Execute
  2. Skip
  3. Edit Command

  > _
```

### 3.4. Tables & Summaries
For returning structured data or status reports.
```
● Status Summary

  Phase 5 Progress:
  ┌────────────────────┬────────────────────┐
  │      Feature       │       Status       │
  ├────────────────────┼────────────────────┤
  │ Project Management │ ✅ Complete        │
  ├────────────────────┼────────────────────┤
  │ Resource Quotas    │ ❌ Not implemented │
  └────────────────────┴────────────────────┘
```

### 3.5. Search Results
Denser view for semantic search.
```
● Search(pattern: "auth logic", output_mode: "content")
  ⎿ Found 3 matches in `src/auth.ts`:
     12:  export const validateToken = (token) => {
     45:  // Auth middleware logic
     88:  const verifySignature = ...
```

### 3.6. Clarification / Ambiguity
When the agent is unsure.
```
● I found multiple files matching "utils":
### 3.7. Expanded Reasoning (Deep Thought)
For Chain of Thought or verbose planning steps, we collapse details by default.
```
● Recalling memory and planning next steps... (Ctrl+O to expand)
```
**Expanded**:
```
● Recalling memory and planning next steps...
  ⎿ [DEBUG] Knowledge Chunk #134 (auth_flow.ts) - Score 0.89
  ⎿ [DEBUG] Search Result: "Next.js 15 breaking changes"
  ⎿ [PLAN]  1. Check package.json
            2. Run migration script
```

### 3.8. Context & Cost Footer (StatusBar)
Always visible at the bottom (Ink `Box`).
```
[ Context: 12 files (45k tokens) ] [ Cost: $0.04 session ] [ Model: Claude 3.5 Sonnet ]
```

### 3.9. File Tree (Context Dump)
When using `/context` or on startup.
```
● Loaded Context:
  ├── src/
  │   ├── index.ts (1.2k tokens)
  │   └── utils.ts (400 tokens)
  └── package.json
```

### 3.10. Usage & Cost Views
**`/cost` (Session)**:
```
● Session Cost:
  ⎿ Input:  124k tokens ($0.37)
  ⎿ Output: 4.2k tokens ($0.06)
  ⎿ Total:  $0.43
```

**`/usage` (Historical)**:
```
● Usage Report (January 2026)
  ┌──────────┬──────────────┬───────────┐
  │ Period   │ Tokens (M)   │ Cost ($)  │
  ├──────────┼──────────────┼───────────┤
  │ Today    │ 0.4M         │ $1.20     │
  │ This Mo. │ 12.5M        │ $37.50    │
  │ Last Mo. │ 8.2M         │ $24.60    │
  │ YTD      │ 12.5M        │ $37.50    │
  └──────────┴──────────────┴───────────┘
  (Using Claude 3.5 Sonnet pricing)
```
