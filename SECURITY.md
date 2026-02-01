# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |
| < 0.4   | :x:                |

## Security Features

### v0.4.2-security

This release implements comprehensive security hardening:

#### 1. MCP API Protection [NEW]
- **Keychain Integration**: MCP API keys migrated from plaintext `mcp.json` to System Keychain
- **Secure Runtime Injection**: Keys injected via `secureEnv` only during active server connection
- **Multi-Account Support**: `KeyManager` handles scoped keys (e.g. `obsidian-mcp:service-a`)

#### 2. Local-First Architecture [NEW]
- **Database Removal**: Removed `prisma`, `pg`, `ioredis` to eliminate external attack surface
- **In-Memory Undo**: Persistence logic moved to memory; no disk footprint for sensitive history

#### 3. API Key Protection
- **KeyManager** (`src/core/keyManager.ts`): Secure key storage
  - macOS Keychain integration
  - Linux secret-tool (libsecret) support
  - Encrypted file fallback (AES-256-GCM)
  - Machine-specific key derivation
  - No plaintext keys in config files

#### 4. PII Redaction
- **Redactor** (`src/core/redactor.ts`): Real-time data masking
  - Redacts sensitive data BEFORE sending to LLM
  - Patterns: email, phone, SSN, credit cards, API keys, passwords, JWT, private keys
  - Configurable via settings

#### 5. Audit Logging
- **AuditLog** (`src/core/auditLog.ts`): Complete accountability
  - All command executions logged
  - File operations tracked
  - Approval decisions recorded
  - JSON format at `.obsidian/audit.log`

#### 6. Command Approval
- **Auditor** (`src/core/auditor.ts`): Pre-flight security
  - Blocked patterns (rm -rf /, fork bombs, curl|sh)
  - Approval-required patterns (git push --force, npm publish)
  - Safe mode enforces approval for all writes

#### 7. Sandbox Isolation
- **Sandbox** (`src/core/sandbox.ts`): OS-level isolation
  - Anthropic sandbox-runtime support
  - macOS sandbox-exec fallback
  - Linux firejail fallback

## Dependency Audit

Last audit: 2026-02-01

### Current Status

```
0 critical, 0 high, 6 moderate severity vulnerabilities
```

### Analysis

| Package | Severity | Impact | Notes |
|---------|----------|--------|-------|
| esbuild | Moderate | Dev only | Build tool, not runtime |
| vite | Moderate | Dev only | Test framework dependency |
| vitest | Moderate | Dev only | Test framework |
| pkg | Moderate | Optional | Binary packaging (not used in runtime) |

### Risk Assessment

**Runtime Risk: LOW**
- All vulnerabilities are in development dependencies
- No vulnerabilities affect production runtime code
- Core security features are implemented in pure TypeScript

### Remediation Plan

1. **vite/vitest**: Upgrade when vitest@4.x stabilizes (breaking changes)
2. **pkg**: Consider alternative packaging if needed

## Reporting a Vulnerability

Please report security vulnerabilities via:

1. **GitHub Security Advisories**: [Create advisory](https://github.com/auroradeveloperops/obsidian-next/security/advisories/new)
2. **Email**: aurora.foundation.labs@gmail.com

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Fix Timeline**: Depends on severity
  - Critical: 24-48 hours
  - High: 7 days
  - Medium: 30 days
  - Low: Next release

## Security Best Practices

### For Users

1. **Use Safe Mode** (default): Requires approval for all write operations
2. **Review Audit Logs**: Check `.obsidian/audit.log` periodically
3. **Rotate API Keys**: Use `/init` to update keys periodically
4. **Keep Updated**: Always use the latest version

### For Contributors

1. **Never commit secrets**: Use environment variables or KeyManager
2. **Validate all input**: Especially in tools
3. **Use auditor**: All new tools must pass auditor checks
4. **Add tests**: Security features must have test coverage

## Compliance

- **OWASP Top 10**: Addressed via input validation and auditor
- **CWE-78**: Command injection prevented by auditor patterns
- **CWE-200**: Information exposure mitigated by PII redactor
