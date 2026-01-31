# Sandbox Runtime Integration

## Overview

Integration of Anthropic's `@anthropic-ai/sandbox-runtime` to provide multiple layers of isolation:
- **Local Mode** (Default): Direct execution with auditor safety checks and prompt confirmation.
- **Sandbox Mode** (Implemented): OS-level sandboxing with strict isolation.

## Execution Modes

```typescript
type ExecutionMode = 'local' | 'sandbox';
```

### Tool Execution Flow

```
Tool Call -> [Mode Check]
    ├─→ Local Mode → Auditor → Direct Execution
    └─→ Sandbox Mode → Auditor → SandboxExecutor → Sandboxed Execution
```

## Implementation

Located in `src/core/sandbox.ts`.

### Fallback Strategy
The system attempts to use the best available isolation method:
1. **@anthropic-ai/sandbox-runtime** (Preferred): Bundled with `@vscode/ripgrep` for zero-config availability.
2. **Native OS Sandbox**:
   - **macOS**: uses `sandbox-exec` with a restrict-network SBPL profile (Verified on macOS Sonoma).
   - **Linux**: uses `firejail` (if installed) to block network/sensitive paths.
3. **Local**: Falls back to direct execution if no sandbox tools are available (with Auditor warnings).

### Configuration

Managed via `/sandbox` command or `.obsidian/config.json`.

```json
{
  "executionMode": "sandbox",
  "sandbox": {
    "allowedDomains": ["*.github.com", "npmjs.org"],
    "denyRead": ["~/.ssh", "~/.aws"],
    "allowWrite": ["."]
  }
}

> **Note**: The sandbox now enforces a **Strict Allowlist** policy by default. It denies read access to the User Home directory and only explicitly allows the Workspace, `/tmp`, and essential system paths (`/usr`, `/bin`, etc.).
```

## Usage

```bash
# Enable sandbox mode
/sandbox sandbox

# Disable sandbox mode
/sandbox local
```
