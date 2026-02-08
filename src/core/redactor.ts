/**
 * PII Redactor - Protects sensitive data from being sent to LLM
 *
 * Automatically redacts:
 * - Email addresses
 * - Phone numbers
 * - Social Security Numbers (SSN)
 * - Credit card numbers
 * - AWS access keys
 * - API keys and tokens
 * - Passwords in config files
 *
 * All redacted content is replaced with descriptive placeholders
 * like [REDACTED:email] so the LLM understands what was there.
 */

export interface RedactionRule {
    name: string;
    pattern: RegExp;
    replacement: string | ((match: string) => string);
    enabled: boolean;
    description: string;
}

export interface RedactionResult {
    text: string;
    redactionCount: number;
    redactedTypes: string[];
}

// Built-in redaction patterns
const BUILTIN_RULES: RedactionRule[] = [
    // Email addresses
    {
        name: 'email',
        pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        replacement: '[REDACTED:email]',
        enabled: true,
        description: 'Email addresses',
    },

    // Phone numbers (various formats) - must have separators to avoid false positives
    {
        name: 'phone',
        pattern: /(\+?1[-.\s])?\(?\d{3}\)?[-.\s]\d{3,4}[-.\s]\d{4}\b/g,
        replacement: '[REDACTED:phone]',
        enabled: true,
        description: 'Phone numbers (US format with separators)',
    },

    // Social Security Numbers
    {
        name: 'ssn',
        pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
        replacement: '[REDACTED:ssn]',
        enabled: true,
        description: 'Social Security Numbers',
    },

    // Credit card numbers (basic patterns)
    {
        name: 'credit-card',
        pattern: /\b(?:4\d{3}|5[1-5]\d{2}|6(?:011|5\d{2})|3[47]\d{2})[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
        replacement: '[REDACTED:credit-card]',
        enabled: true,
        description: 'Credit card numbers',
    },

    // AWS Access Keys
    {
        name: 'aws-access-key',
        pattern: /\b(AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
        replacement: '[REDACTED:aws-key]',
        enabled: true,
        description: 'AWS access key IDs',
    },

    // AWS Secret Keys (40 char base64-like)
    {
        name: 'aws-secret-key',
        pattern: /\b[A-Za-z0-9/+=]{40}\b/g,
        replacement: (match) => {
            // Only redact if it looks like a secret key (has mixed case and special chars)
            if (/[A-Z]/.test(match) && /[a-z]/.test(match) && /[/+=]/.test(match)) {
                return '[REDACTED:aws-secret]';
            }
            return match;
        },
        enabled: true,
        description: 'AWS secret access keys',
    },

    // Anthropic API Keys
    {
        name: 'anthropic-key',
        pattern: /\bsk-ant-[a-zA-Z0-9-_]{20,}/g,
        replacement: '[REDACTED:anthropic-key]',
        enabled: true,
        description: 'Anthropic API keys',
    },

    // OpenAI API Keys (start with sk- but not sk-ant-, may contain hyphens)
    {
        name: 'openai-key',
        pattern: /sk-(?!ant)[a-zA-Z0-9-]{20,}/g,
        replacement: '[REDACTED:openai-key]',
        enabled: true,
        description: 'OpenAI API keys',
    },

    // Generic API keys (common patterns)
    {
        name: 'api-key-generic',
        pattern: /\b(api[_-]?key|apikey|api[_-]?secret|api[_-]?token)\s*[=:]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
        replacement: (match) => {
            const keyName = match.split(/[=:]/)[0].trim();
            return `${keyName}=[REDACTED:api-key]`;
        },
        enabled: true,
        description: 'Generic API keys in config',
    },

    // Passwords in config files (various naming conventions)
    {
        name: 'password-config',
        pattern: /\b([A-Z_]*(?:PASSWORD|PASSWD|PWD|SECRET)[A-Z_]*)\s*[=:]\s*['"]?([^'"\s\n]{4,})['"]?/gi,
        replacement: (match) => {
            const keyName = match.split(/[=:]/)[0].trim();
            return `${keyName}=[REDACTED:password]`;
        },
        enabled: true,
        description: 'Passwords in configuration',
    },

    // Private keys (PEM format)
    {
        name: 'private-key',
        pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE\s+KEY-----/g,
        replacement: '[REDACTED:private-key]',
        enabled: true,
        description: 'PEM private keys',
    },

    // JWT tokens
    {
        name: 'jwt',
        pattern: /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
        replacement: '[REDACTED:jwt]',
        enabled: true,
        description: 'JWT tokens',
    },

    // GitHub tokens (various prefixes)
    {
        name: 'github-token',
        pattern: /(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{20,}/g,
        replacement: '[REDACTED:github-token]',
        enabled: true,
        description: 'GitHub tokens',
    },

    // Stripe keys
    {
        name: 'stripe-key',
        pattern: /\b(sk|pk)_(test|live)_[a-zA-Z0-9]{24,}/g,
        replacement: '[REDACTED:stripe-key]',
        enabled: true,
        description: 'Stripe API keys',
    },

    // IP addresses (private networks only by default)
    {
        name: 'private-ip',
        pattern: /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
        replacement: '[REDACTED:private-ip]',
        enabled: false, // Disabled by default - may cause issues with code
        description: 'Private IP addresses',
    },

    // GitHub Fine-grained Personal Access Tokens (newer format)
    {
        name: 'github-fine-grained-pat',
        pattern: /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g,
        replacement: '[REDACTED:github-pat]',
        enabled: true,
        description: 'GitHub fine-grained personal access tokens',
    },

    // Slack tokens (various types)
    {
        name: 'slack-token',
        pattern: /xox[baprs]-[a-zA-Z0-9-]{10,}/g,
        replacement: '[REDACTED:slack-token]',
        enabled: true,
        description: 'Slack API tokens',
    },

    // Discord tokens
    {
        name: 'discord-token',
        pattern: /[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}/g,
        replacement: '[REDACTED:discord-token]',
        enabled: true,
        description: 'Discord bot tokens',
    },

    // Google API keys
    {
        name: 'google-api-key',
        pattern: /AIza[0-9A-Za-z\\-_]{35}/g,
        replacement: '[REDACTED:google-api-key]',
        enabled: true,
        description: 'Google API keys',
    },

    // Twilio keys
    {
        name: 'twilio-key',
        pattern: /SK[a-f0-9]{32}/g,
        replacement: '[REDACTED:twilio-key]',
        enabled: true,
        description: 'Twilio API keys',
    },

    // SendGrid keys
    {
        name: 'sendgrid-key',
        pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g,
        replacement: '[REDACTED:sendgrid-key]',
        enabled: true,
        description: 'SendGrid API keys',
    },

    // NPM tokens
    {
        name: 'npm-token',
        pattern: /npm_[a-zA-Z0-9]{36}/g,
        replacement: '[REDACTED:npm-token]',
        enabled: true,
        description: 'NPM access tokens',
    },

    // PyPI tokens
    {
        name: 'pypi-token',
        pattern: /pypi-[a-zA-Z0-9_-]{100,}/g,
        replacement: '[REDACTED:pypi-token]',
        enabled: true,
        description: 'PyPI API tokens',
    },

    // Database connection strings
    {
        name: 'db-connection-string',
        pattern: /(mongodb(\+srv)?|postgres(ql)?|mysql|redis):\/\/[^\s'"]+/gi,
        replacement: '[REDACTED:db-connection-string]',
        enabled: true,
        description: 'Database connection strings',
    },

    // Bearer tokens in headers
    {
        name: 'bearer-token',
        pattern: /Bearer\s+[a-zA-Z0-9_-]{20,}/gi,
        replacement: 'Bearer [REDACTED:bearer-token]',
        enabled: true,
        description: 'Bearer authentication tokens',
    },

    // Basic auth in URLs
    {
        name: 'basic-auth-url',
        pattern: /:\/\/[^:]+:[^@]+@/g,
        replacement: '://[REDACTED:credentials]@',
        enabled: true,
        description: 'Basic auth credentials in URLs',
    },
];

class Redactor {
    private rules: RedactionRule[] = [...BUILTIN_RULES];
    private enabled: boolean = true;
    private allowlist: Set<string> = new Set();

    /**
     * Enable or disable redaction globally
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Check if redaction is enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Enable or disable a specific rule
     */
    setRuleEnabled(ruleName: string, enabled: boolean): void {
        const rule = this.rules.find(r => r.name === ruleName);
        if (rule) {
            rule.enabled = enabled;
        }
    }

    /**
     * Add a pattern to the allowlist (won't be redacted)
     */
    addToAllowlist(pattern: string): void {
        this.allowlist.add(pattern);
    }

    /**
     * Remove a pattern from the allowlist
     */
    removeFromAllowlist(pattern: string): void {
        this.allowlist.delete(pattern);
    }

    /**
     * Add a custom redaction rule
     */
    addRule(rule: RedactionRule): void {
        this.rules.push(rule);
    }

    /**
     * Get all available rules
     */
    getRules(): RedactionRule[] {
        return this.rules;
    }

    /**
     * Redact sensitive information from text
     */
    redact(text: string): RedactionResult {
        if (!this.enabled || !text) {
            return { text, redactionCount: 0, redactedTypes: [] };
        }

        let result = text;
        let totalRedactions = 0;
        const redactedTypes = new Set<string>();

        for (const rule of this.rules) {
            if (!rule.enabled) continue;

            // Reset regex lastIndex for global patterns
            rule.pattern.lastIndex = 0;

            const matches = text.match(rule.pattern);
            if (matches) {
                for (const match of matches) {
                    // Skip if in allowlist
                    if (this.allowlist.has(match)) continue;

                    const replacement = typeof rule.replacement === 'function'
                        ? rule.replacement(match)
                        : rule.replacement;

                    // Only count as redaction if something actually changed
                    if (replacement !== match) {
                        result = result.replace(match, replacement);
                        totalRedactions++;
                        redactedTypes.add(rule.name);
                    }
                }
            }
        }

        return {
            text: result,
            redactionCount: totalRedactions,
            redactedTypes: Array.from(redactedTypes),
        };
    }

    /**
     * Redact tool output specifically (used before sending to LLM)
     */
    redactToolOutput(toolName: string, output: string): RedactionResult {
        // Apply standard redaction
        return this.redact(output);
    }

    /**
     * Check if text contains any sensitive patterns
     */
    containsSensitiveData(text: string): { hasSensitive: boolean; types: string[] } {
        if (!text) {
            return { hasSensitive: false, types: [] };
        }

        const types: string[] = [];

        for (const rule of this.rules) {
            if (!rule.enabled) continue;

            rule.pattern.lastIndex = 0;
            if (rule.pattern.test(text)) {
                types.push(rule.name);
            }
        }

        return { hasSensitive: types.length > 0, types };
    }

    /**
     * Get statistics about what would be redacted
     */
    analyze(text: string): { ruleName: string; count: number; examples: string[] }[] {
        const stats: { ruleName: string; count: number; examples: string[] }[] = [];

        for (const rule of this.rules) {
            if (!rule.enabled) continue;

            rule.pattern.lastIndex = 0;
            const matches = text.match(rule.pattern) || [];

            if (matches.length > 0) {
                stats.push({
                    ruleName: rule.name,
                    count: matches.length,
                    // Only show first 3 examples, partially masked
                    examples: matches.slice(0, 3).map(m =>
                        m.length > 10 ? m.slice(0, 5) + '...' + m.slice(-3) : '***'
                    ),
                });
            }
        }

        return stats;
    }
}

export const redactor = new Redactor();
