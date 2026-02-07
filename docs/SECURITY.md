# Security Policy

> Version: 0.4.6 | Last Updated: 2026-02-07

This document describes the security model, known limitations, and autonomous safeguards for the system-wide Obsidian Next daemon.

---

## Security Model: The Global Zero Trust Daemon

Obsidian Next implements a **Global Zero Trust** model where every operation—whether triggered by a local CLI, a mobile Telegram gateway, or a background heartbeat—is validated before execution.

### Autonomous Defense Layers

```
Request (CLI / TG / Cron)
    |
    v
[1. Socket Authentication] - Unix Domain Socket permissions
    |
    v
[2. Global Command Auditor] - Boundary check relative to workspaceRoot
    |
    v
[3. Global Settings Check] - Centralized Allow/Deny lists
    |
    v
[4. Remote/Local Approval] - Multi-channel confirmation
    |
    v
[5. Sandbox Execution] - OS-level isolation (Process-level)
    |
    v
[6. Visual Privacy Guard] - Screenshot redaction (Pilot Mode)
    |
    v
[7. Audit Logging] - System-wide immutable record (~/.obsidian-next/audit.log)
```

---

## Security Features

### Global Command Auditor (`src/core/auditor.ts`)

The auditor now enforces security globally. Even if the CLI is launched from `/`, the agent is restricted to the current `workspaceRoot`.

**Blocked Patterns (Critical - Never Allowed):**
- `rm -rf /` - Root filesystem deletion
- Fork bombs (`:(){:|:&};:`)
- Disk overwrites (`> /dev/sda`, `dd if=`)
- `chmod -R 777 /` - Permission escalation
- Pipe-to-shell (`curl URL | sh`, `wget URL | bash`)

### Pilot Mode Privacy (GUI Automation)

When the agent uses the **Computer Use API** (Pilot Mode), it employs a **Visual Privacy Guard**:
1.  **PII Redaction**: Real-time blurring of sensitive screen areas (browser tabs, menu bars, terminal history) before images are sent to the vision model.
2.  **Safety Overlay**: A system notification or red border appears when the agent is taking control of the mouse/keyboard.
3.  **Kill Switch**: Immediate termination of all OS-level control via signal handling or a global hotkey.

### Path Validation

The auditor validates that all file operations are:
- Strictly within the active `workspaceRoot`.
- Not using path traversal (`../`) to escape the workspace.
- Not accessing ignored directories (`node_modules`, `.git`, `.obsidian-next`).

### Secure Daemon IPC

Communication between the CLI and the background service happens via **Unix Domain Sockets** (`~/.obsidian-next/daemon.sock`).
- **File Permissions**: The socket is restricted to the current user (0600).
- **Process Verification**: The daemon verifies the UID of the connecting process.

---

## Global Security Configuration

### Centralized Settings (`~/.obsidian-next/settings.json`)

```json
{
  "mode": "safe",
  "security": {
    "piiRedaction": true,
    "auditLogging": true,
    "sandbox": true,
    "pilotMode": {
      "maskScreenshots": true,
      "requireApproval": true
    }
  }
}
```

---

## Compliance & Logging

### System-Wide Audit Log

The audit log is now centralized in `~/.obsidian-next/audit.log`, capturing events from all workspaces and remote sessions.
- **Redacted Records**: Sensitive data identified by the PII Redactor is replaced with `[REDACTED]` in the log to ensure the log file itself isn't a security risk.
- **Session Attribution**: Every log entry includes the `sessionId` and `source` (cli, telegram, cron).

---

## Supported Platforms

| Platform | Version | Sandbox Support |
|----------|---------|-----------------|
| macOS | 12+ (Monterey) | Full (`sandbox-exec`) |
| Ubuntu | 20.04+ | Full (`firejail`) |
| Linux (Generic)| Kernel 5.15+ | Partial (Namespaces) |
| Windows | WSL2 | Supported via firejail |
