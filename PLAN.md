# Settings System Plan

## Current State Analysis

### What Exists
| File | Purpose | Location |
|------|---------|----------|
| `config.ts` | API key, model, maxTokens | `~/.obsidian/config.json` |
| `context.ts` | Session state (mode, task, files) | `.obsidian/context.json` |
| `auditor.ts` | Hardcoded security patterns | N/A (code) |

### What's Missing
1. **Settings file** - No `.obsidian/settings.json`
2. **Auto-accept toggle** - Everything requires approval or nothing does
3. **Tool permissions** - Hardcoded in auditor, not configurable
4. **Diff/code colors** - `ToolOutput.tsx` renders plain text, `highlight.ts` exists but unused

---

## Proposed Settings Schema

```typescript
// .obsidian/settings.json
interface Settings {
  // Execution mode
  mode: 'auto' | 'plan' | 'safe';

  // Auto-accept settings
  autoAccept: {
    enabled: boolean;           // Master toggle
    readOperations: boolean;    // Auto-accept reads
    safeCommands: boolean;      // Auto-accept git status, ls, etc.
  };

  // Tool permissions
  permissions: {
    // Patterns that are always allowed (no prompt)
    allow: string[];            // e.g., ["bash:git status", "bash:npm test"]

    // Patterns that are always blocked
    deny: string[];             // e.g., ["bash:rm -rf /"]

    // Everything else follows mode rules
  };

  // UI preferences
  ui: {
    syntaxHighlight: boolean;
    diffColors: boolean;
    showLineNumbers: boolean;
  };
}
```

### Default Settings
```json
{
  "mode": "safe",
  "autoAccept": {
    "enabled": false,
    "readOperations": true,
    "safeCommands": true
  },
  "permissions": {
    "allow": [
      "read:*",
      "list:*",
      "glob:*",
      "grep:*",
      "bash:git status",
      "bash:git diff",
      "bash:git log*",
      "bash:npm test*",
      "bash:npm run lint*"
    ],
    "deny": []
  },
  "ui": {
    "syntaxHighlight": true,
    "diffColors": true,
    "showLineNumbers": true
  }
}
```

---

## Implementation Tasks

### 1. Create Settings Manager (`src/core/settings.ts`)
- Load/save `.obsidian/settings.json`
- Merge with defaults
- Schema validation with zod
- Export singleton

### 2. Update Auditor to Use Permissions
- Check `settings.permissions.allow` before prompting
- Check `settings.permissions.deny` before executing
- Pattern matching: `tool:command` format

### 3. Integrate Auto-Accept Logic
- In `tools.ts`, check `settings.autoAccept` before `requestApproval()`
- Read operations skip approval if `autoAccept.readOperations`
- Safe commands skip approval if `autoAccept.safeCommands`

### 4. Fix Diff Colors in ToolOutput
- Import `highlightJson` from `utils/highlight.ts`
- Detect diff output (lines starting with +/-)
- Apply green/red coloring

### 5. Add `/settings` Command
- View current settings
- Edit via `/settings mode auto`, `/settings autoAccept.enabled true`

---

## Roadmap Progress vs Architecture

| Component | Architecture Says | Status |
|-----------|-------------------|--------|
| Event Bus | TypedEventEmitter | Done |
| Supervisor Loop | Input->Think->Audit->Execute | Done |
| Tools (8) | bash, read, write, edit, list, grep, glob, web_fetch | Done |
| Auditor | Security checks | Done (hardcoded) |
| Config | Config loader | Done (basic) |
| Context | Working memory | Done |
| History | Conversation history | Done |
| Sandbox | Sandbox execution | Partial |
| Tasks | Task tracking | Done |
| Undo | Undo system | Done |
| Usage | Cost tracking | Done |
| MCP | Model Context Protocol | Not started |

### Missing from Architecture
- Settings system (this plan)
- Permission management
- Syntax highlighting integration
- Plan mode completion (just fixed)

---

## Quick Fixes Needed Now

### 1. Diff Colors (ToolOutput.tsx)
```tsx
// Add diff line coloring
const renderOutput = (output: string) => {
  return output.split('\n').map((line, i) => {
    if (line.startsWith('+')) return <Text key={i} color="green">{line}</Text>;
    if (line.startsWith('-')) return <Text key={i} color="red">{line}</Text>;
    return <Text key={i}>{line}</Text>;
  });
};
```

### 2. JSON Highlighting for Tool Args
In `Root.tsx`, import and use `highlightJson` for `tool_start` args display.
