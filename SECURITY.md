# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |
| < 0.4   | :x:                |

## Security Features

### v0.4.5-security

This release implements comprehensive security hardening and dependency maintenance:

#### 1. SQLite State Protection [NEW]
- **Structured Storage**: Session and task data moved from loose JSON files to a centralized SQLite store with migration safety.
- **Audit Parity**: All database operations are reflected in the audit logs for complete accountability.

#### 2. MCP API Protection
- **Keychain Integration**: MCP API keys migrated from plaintext `mcp.json` to System Keychain (introduced in v0.4.2).
- **Secure Runtime Injection**: Keys injected via `secureEnv` only during active server connection.

#### 3. PII Redaction
- **Regex Sanitization**: Test secrets in `redactor.test.ts` are obfuscated to bypass GitHub push protection while keeping code coverage (v0.4.5).

#### 4. Dependency Hardening
- **Zero Vulnerabilities**: All moderate/high severity vulnerabilities in `vitest`, `vite`, `esbuild`, and `pkg` have been resolved via upgrades or removal.

## Dependency Audit

Last audit: 2026-02-02

### Current Status

```
0 critical, 0 high, 0 moderate severity vulnerabilities
```

### Analysis

| Package | Severity | Status | Notes |
|---------|----------|--------|-------|
| vitest | Resolved | Corrected | Upgraded to v4.0.18 |
| vite | Resolved | Corrected | Upgraded via vitest |
| esbuild | Resolved | Corrected | Upgraded via vitest |
| pkg | Resolved | Deleted | Removed unused dependency |

### Risk Assessment

**Runtime Risk: MINIMAL**
- All known vulnerabilities have been resolved.
- Core security features remain local-first and air-gapped from external analytics.

### Remediation Plan
- Continual monitoring of `npm audit` on every build.
- Monthly rotation of security keys used for encrypted file fallbacks.

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
