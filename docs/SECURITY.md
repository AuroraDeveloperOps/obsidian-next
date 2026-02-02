# Security Policy

> Version: 0.4.5 | Last Updated: 2026-02-02

This document describes the security model, known limitations, and vulnerability disclosure process for Obsidian Next.

---

## Security Model

Obsidian Next implements a **Zero Trust** execution model where every operation is validated before execution.

### Defense Layers

```
User Input
    |
    v
[1. Input Validation] - Zod schema validation
    |
    v
[2. Command Auditor] - Pattern-based blocking
    |
    v
[3. Settings Check] - Allow/deny lists
    |
    v
[4. User Approval] - Interactive confirmation
    |
    v
[5. Sandbox Execution] - OS-level isolation
    |
    v
[6. Output Redaction] - PII removal
    |
    v
[7. Audit Logging] - Immutable records
```

---

## Security Features

### Command Auditor (`src/core/auditor.ts`)

**Blocked Patterns (Critical - Never Allowed):**
- `rm -rf /` - Root filesystem deletion
- Fork bombs (`:(){:|:&};:`)
- Disk overwrites (`> /dev/sda`, `dd if=`)
- `chmod -R 777 /` - Permission escalation
- Pipe-to-shell (`curl URL | sh`, `wget URL | bash`)

**Approval Required:**
- Recursive delete (`rm -rf`, `rm -r`)
- Force push (`git push --force`)
- Hard reset (`git reset --hard`)
- Publishing (`npm publish`)
- Container removal (`docker rm`)
- SQL destructive (`DROP TABLE`, `DROP DATABASE`)

### Path Validation

All file operations validate paths are:
- Within workspace directory
- Not using path traversal (`../`)
- Not accessing ignored directories (`node_modules`, `.git`)

### PII Redaction (`src/core/redactor.ts`)

Detects and redacts 30+ patterns including:
- Email addresses
- Phone numbers
- Social Security Numbers
- Credit card numbers
- API keys (AWS, GitHub, OpenAI, Anthropic, Slack)
- JWT tokens
- Private keys
- Passwords in URLs

### Secure Credential Storage (`src/core/keyManager.ts`)

Credentials stored using:
1. **macOS**: System Keychain via `security` CLI
2. **Linux**: `secret-tool` (libsecret)
3. **Fallback**: AES-256-GCM encrypted file with machine-specific key

### Sandbox Execution (`src/core/sandbox.ts`)

OS-level isolation:
- **macOS**: `sandbox-exec` with restrictive profile
- **Linux**: `firejail` fallback

Network allowlist: GitHub, npmjs, Anthropic APIs only.

### Audit Logging (`src/core/auditLog.ts`)

Comprehensive logging of:
- All command executions (success/failure)
- File operations (read/write/edit)
- Security violations
- Approval decisions
- Session events

Logs stored at `.obsidian/audit.log` with 10MB rotation.

---

## Known Limitations

### Current Security Gaps

| Gap | Risk | Status |
|-----|------|--------|
| Pattern-based auditor | Obfuscation bypass possible | Planned: AST parsing |
| No symlink validation | Path traversal via symlinks | Planned: `fs.lstat()` |
| MCP binary trust | No checksum verification | Planned: Signed manifests |
| PII redaction disabled by default | Credential exposure | Planned: Enable by default |

### What We Don't Protect Against

1. **Malicious LLM responses** - The AI could generate harmful code that doesn't match blocked patterns
2. **Social engineering** - User approving dangerous operations
3. **Supply chain attacks** - Compromised npm packages
4. **Physical access** - Local attacker with filesystem access
5. **Memory inspection** - Credentials in memory during execution

---

## Supported Platforms

| Platform | Version | Sandbox Support |
|----------|---------|-----------------|
| macOS | 12+ (Monterey) | Full (`sandbox-exec`) |
| macOS | 10.15-11 | Partial |
| Ubuntu | 20.04+ | Full (`firejail`) |
| Debian | 11+ | Full (`firejail`) |
| Windows | 10/11 | None (planned) |

---

## Security Configuration

### Settings File (`.obsidian/settings.json`)

```json
{
  "mode": "safe",
  "security": {
    "piiRedaction": true,
    "auditLogging": true,
    "keyBackend": "auto",
    "sandbox": true
  },
  "permissions": {
    "allow": [],
    "allowUnsandboxed": [],
    "deny": []
  }
}
```

### Recommended Production Settings

```json
{
  "mode": "safe",
  "security": {
    "piiRedaction": true,
    "auditLogging": true,
    "sandbox": true
  },
  "permissions": {
    "deny": [
      "bash:npm publish*",
      "bash:git push --force*"
    ]
  }
}
```

---

## Vulnerability Disclosure

### Reporting Security Issues

**DO NOT** file public GitHub issues for security vulnerabilities.

Email security reports to: `security@aurora-foundation.dev`

Include:
1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if any)

### Response Timeline

| Severity | Initial Response | Fix Target |
|----------|-----------------|------------|
| Critical | 24 hours | 48 hours |
| High | 48 hours | 1 week |
| Medium | 1 week | 2 weeks |
| Low | 2 weeks | Next release |

### Severity Classification

- **Critical**: Remote code execution, credential theft, data destruction
- **High**: Sandbox escape, privilege escalation, significant data exposure
- **Medium**: Information disclosure, denial of service
- **Low**: Minor information leaks, edge case bypasses

---

## Security Checklist for Contributors

When submitting code:

- [ ] No hardcoded credentials or secrets
- [ ] No `eval()` or dynamic code execution
- [ ] User input validated with Zod schemas
- [ ] File paths validated through auditor
- [ ] Sensitive data redacted from logs
- [ ] New commands added to auditor patterns if dangerous
- [ ] Tests include security edge cases

---

## Compliance Notes

### Data Handling

- All data stored locally (no cloud sync)
- Session data in `.obsidian/state.db`
- Audit logs in `.obsidian/audit.log`
- No telemetry or analytics

### Credential Storage

- Never stored in plaintext
- System keychain preferred
- Encrypted fallback uses PBKDF2 + AES-256-GCM
- Machine-specific key derivation

### Third-Party Dependencies

Critical dependencies audited:
- `@anthropic-ai/sdk` - Anthropic official
- `better-sqlite3` - Widely used, native bindings
- `zod` - Runtime validation
- `ink` - Terminal UI framework

Run `npm audit` regularly to check for vulnerabilities.

---

## Version History

| Version | Security Changes |
|---------|------------------|
| 0.4.5 | SQLite state store, memory persistence |
| 0.4.2 | Keychain integration, secure MCP keys |
| 0.3.0 | KeyManager, PII Redactor, Audit Logging |
| 0.2.0 | Auditor patterns, sandbox support |
