# Sandbox Runtime Integration Plan

## Overview

Integration of Anthropic's `@anthropic-ai/sandbox-runtime` to provide dual execution modes:
- **Local Mode** (current): Direct execution with auditor safety checks
- **Sandbox Mode** (planned): OS-level sandboxing with strict isolation

## Architecture

### Execution Modes

```typescript
type ExecutionMode = 'local' | 'sandbox';

interface ExecutionConfig {
    mode: ExecutionMode;
    sandbox?: {
        network: {
            allowedDomains: string[];
            deniedDomains: string[];
        };
        filesystem: {
            denyRead: string[];
            allowWrite: string[];
            denyWrite: string[];
        };
    };
}
```

### Tool Execution Flow

```
User Request
    ↓
Claude Decision
    ↓
Tool Call
    ↓
[Mode Check]
    ├─→ Local Mode → Auditor → Direct Execution
    └─→ Sandbox Mode → Auditor → SandboxManager → Sandboxed Execution
    ↓
Tool Result
    ↓
Claude Response
```

## Implementation Steps

### 1. Install Dependencies

```bash
npm install @anthropic-ai/sandbox-runtime
```

**Linux Requirements:**
- bubblewrap
- socat
- ripgrep

**macOS Requirements:**
- ripgrep (brew install ripgrep)
- sandbox-exec (built-in)

### 2. Create Sandbox Manager Wrapper

```typescript
// src/core/sandbox.ts

import {
    SandboxManager,
    type SandboxRuntimeConfig,
} from '@anthropic-ai/sandbox-runtime';
import { config } from './config.js';

export class SandboxExecutor {
    private initialized = false;
    private currentConfig: SandboxRuntimeConfig | null = null;

    async initialize() {
        const cfg = await config.load();

        if (cfg.executionMode !== 'sandbox') {
            return; // Not in sandbox mode
        }

        this.currentConfig = {
            network: {
                allowedDomains: cfg.sandbox?.allowedDomains || [],
                deniedDomains: cfg.sandbox?.deniedDomains || [],
            },
            filesystem: {
                denyRead: [
                    '~/.ssh',
                    '~/.aws',
                    '~/.config/gcloud',
                    ...(cfg.sandbox?.denyRead || [])
                ],
                allowWrite: [
                    '.', // Current workspace
                    '/tmp',
                    ...(cfg.sandbox?.allowWrite || [])
                ],
                denyWrite: [
                    '.env',
                    '.env.local',
                    ...(cfg.sandbox?.denyWrite || [])
                ],
            },
        };

        await SandboxManager.initialize(this.currentConfig);
        this.initialized = true;
    }

    async wrapCommand(command: string): Promise<string> {
        if (!this.initialized) {
            return command; // Fallback to direct execution
        }

        return await SandboxManager.wrapWithSandbox(command);
    }

    async reset() {
        if (this.initialized) {
            await SandboxManager.reset();
            this.initialized = false;
        }
    }
}

export const sandboxExecutor = new SandboxExecutor();
```

### 3. Update Tool System

Modify `src/core/tools.ts` to use sandbox mode:

```typescript
import { sandboxExecutor } from './sandbox.js';
import { config } from './config.js';

// In BashTool.execute():
async execute(args: Record<string, any>): Promise<ToolResult> {
    const command = args.command as string;
    const cfg = await config.load();

    // Security checks
    const audit = await auditor.checkCommand(command);
    if (!audit.approved) {
        return { success: false, error: audit.reason };
    }

    // Wrap with sandbox if enabled
    let execCommand = command;
    if (cfg.executionMode === 'sandbox') {
        execCommand = await sandboxExecutor.wrapCommand(command);
    }

    // Execute
    const { stdout, stderr } = await execAsync(execCommand, { ... });
    return { success: true, output: stdout || stderr };
}
```

### 4. Add Configuration Schema

Update `src/core/config.ts`:

```typescript
const configSchema = z.object({
    apiKey: z.string().optional(),
    model: z.string().default('claude-sonnet-4-5'),
    maxTokens: z.number().default(8192),
    executionMode: z.enum(['local', 'sandbox']).default('local'),
    sandbox: z.object({
        allowedDomains: z.array(z.string()).default([]),
        deniedDomains: z.array(z.string()).default([]),
        denyRead: z.array(z.string()).default([]),
        allowWrite: z.array(z.string()).default([]),
        denyWrite: z.array(z.string()).default([]),
    }).optional(),
});
```

### 5. Add /sandbox Command

```typescript
// src/commands/sandbox.ts

export const sandboxCommand: CommandHandler = async (args) => {
    const cfg = await config.load();

    if (args.length === 0) {
        // Show current mode
        bus.emitAgent({
            type: 'thought',
            content: `Current execution mode: ${cfg.executionMode || 'local'}\n\n` +
                     `Available modes:\n` +
                     `  • local: Direct execution with auditor checks\n` +
                     `  • sandbox: OS-level sandboxing with isolation\n\n` +
                     `Usage: /sandbox <local|sandbox>`
        });
        return;
    }

    const mode = args[0];
    if (mode !== 'local' && mode !== 'sandbox') {
        bus.emitAgent({
            type: 'error',
            message: 'Invalid mode. Use "local" or "sandbox".'
        });
        return;
    }

    // Update config
    await config.update({ executionMode: mode });

    // Reinitialize sandbox if needed
    if (mode === 'sandbox') {
        await sandboxExecutor.initialize();
    } else {
        await sandboxExecutor.reset();
    }

    bus.emitAgent({
        type: 'done',
        summary: `Execution mode set to: ${mode}`
    });
};
```

## Security Benefits

### Local Mode
- Auditor pattern validation
- Path sandboxing to workspace
- Command pattern blocking

### Sandbox Mode (All of Local +)
- OS-level filesystem isolation
- Network traffic filtering
- Process tree-wide enforcement
- Violation monitoring and logging
- No container overhead

## Default Sandbox Configuration

```json
{
  "executionMode": "local",
  "sandbox": {
    "allowedDomains": [
      "*.github.com",
      "*.npmjs.org",
      "api.anthropic.com"
    ],
    "deniedDomains": [],
    "denyRead": [
      "~/.ssh",
      "~/.aws",
      "~/.config/gcloud",
      "~/.kube"
    ],
    "allowWrite": [
      ".",
      "/tmp"
    ],
    "denyWrite": [
      ".env",
      ".env.*",
      "*.key",
      "*.pem"
    ]
  }
}
```

## Usage Example

```bash
# Enable sandbox mode
/sandbox sandbox

# All tool executions now sandboxed
User: "Install dependencies"
Claude: [uses bash tool with npm install]
System: [wraps with sandbox-exec/bubblewrap]

# Disable sandbox mode
/sandbox local
```

## Testing

Add sandbox mode tests:

```typescript
// tests/sandbox.test.ts

describe('SandboxExecutor', () => {
    it('should block unauthorized file reads', async () => {
        await config.update({ executionMode: 'sandbox' });
        const result = await tools.execute('read', { path: '~/.ssh/id_rsa' });
        expect(result.success).toBe(false);
    });

    it('should allow workspace writes', async () => {
        const result = await tools.execute('write', {
            path: './test.txt',
            content: 'test'
        });
        expect(result.success).toBe(true);
    });
});
```

## Future Enhancements

- Per-tool sandbox configuration
- Temporary elevated permissions
- Sandbox violation dashboard
- Docker integration for weaker nested sandboxing
- Audit log persistence
- Network traffic inspection

## References

- GitHub: https://github.com/anthropic-experimental/sandbox-runtime
- Docs: See repository README for platform-specific details
