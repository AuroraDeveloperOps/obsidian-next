import { describe, it, expect, beforeEach } from 'vitest';
import { redactor } from '../src/core/redactor.js';

describe('Redactor', () => {
    beforeEach(() => {
        // Ensure redaction is enabled for tests
        redactor.setEnabled(true);
    });

    describe('Email Redaction', () => {
        it('should redact email addresses', () => {
            const input = 'Contact me at john.doe@example.com for more info';
            const result = redactor.redact(input);

            expect(result.text).toBe('Contact me at [REDACTED:email] for more info');
            expect(result.redactionCount).toBe(1);
            expect(result.redactedTypes).toContain('email');
        });

        it('should redact multiple emails', () => {
            const input = 'From: alice@test.org, To: bob@example.net';
            const result = redactor.redact(input);

            expect(result.text).not.toContain('alice@test.org');
            expect(result.text).not.toContain('bob@example.net');
            expect(result.redactionCount).toBe(2);
        });
    });

    describe('Phone Number Redaction', () => {
        it('should redact US phone numbers', () => {
            const input = 'Call me at 555-123-4567';
            const result = redactor.redact(input);

            expect(result.text).toBe('Call me at [REDACTED:phone]');
            expect(result.redactedTypes).toContain('phone');
        });

        it('should redact phone numbers with area code', () => {
            const input = 'Office: (555) 123-4567';
            const result = redactor.redact(input);

            expect(result.text).not.toContain('555');
            expect(result.text).not.toContain('123-4567');
        });
    });

    describe('SSN Redaction', () => {
        it('should redact social security numbers', () => {
            const input = 'SSN: 123-45-6789';
            const result = redactor.redact(input);

            expect(result.text).toBe('SSN: [REDACTED:ssn]');
            expect(result.redactedTypes).toContain('ssn');
        });

        it('should redact SSN without dashes', () => {
            const input = 'SSN: 123 45 6789';
            const result = redactor.redact(input);

            expect(result.text).not.toContain('123 45 6789');
        });
    });

    describe('API Key Redaction', () => {
        it('should redact Anthropic API keys', () => {
            const input = 'ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnop';
            const result = redactor.redact(input);

            expect(result.text).not.toContain('sk-ant-api03');
            expect(result.redactedTypes).toContain('anthropic-key');
        });

        it('should redact OpenAI API keys', () => {
            const input = 'key: sk-abcdefghijklmnopqrstuvwxyz123456789012345678';
            const result = redactor.redact(input);

            expect(result.text).not.toContain('sk-abcdefghij');
            expect(result.redactedTypes).toContain('openai-key');
        });

        it('should redact AWS access keys', () => {
            const input = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
            const result = redactor.redact(input);

            expect(result.text).not.toContain('AKIAIOSFODNN7EXAMPLE');
            expect(result.redactedTypes).toContain('aws-access-key');
        });

        it('should redact GitHub tokens', () => {
            const input = 'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890';
            const result = redactor.redact(input);

            expect(result.text).not.toContain('ghp_');
            expect(result.redactedTypes).toContain('github-token');
        });

        it('should redact Stripe keys', () => {
            // Using FAKE_KEY_ prefix to avoid GitHub secret scanning
            const input = 'stripe_key: sk_live_FAKE_KEY_FOR_TESTING_1234';
            const result = redactor.redact(input);

            expect(result.text).not.toContain('sk_live_');
            expect(result.redactedTypes).toContain('stripe-key');
        });
    });

    describe('Password Redaction', () => {
        it('should redact passwords in config', () => {
            const input = 'DB_PASSWORD=super_secret_password123';
            const result = redactor.redact(input);

            expect(result.text).not.toContain('super_secret_password123');
            expect(result.redactedTypes).toContain('password-config');
        });

        it('should redact password with quotes', () => {
            const input = 'password: "my-secret-pass"';
            const result = redactor.redact(input);

            expect(result.text).not.toContain('my-secret-pass');
        });
    });

    describe('JWT Redaction', () => {
        it('should redact JWT tokens', () => {
            const input = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
            const result = redactor.redact(input);

            expect(result.text).toBe('Bearer [REDACTED:jwt]');
            expect(result.redactedTypes).toContain('jwt');
        });
    });

    describe('Private Key Redaction', () => {
        it('should redact PEM private keys', () => {
            const input = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7
-----END PRIVATE KEY-----`;
            const result = redactor.redact(input);

            expect(result.text).toBe('[REDACTED:private-key]');
            expect(result.redactedTypes).toContain('private-key');
        });
    });

    describe('Control Functions', () => {
        it('should allow disabling redaction', () => {
            redactor.setEnabled(false);
            const input = 'email: test@example.com';
            const result = redactor.redact(input);

            expect(result.text).toBe(input);
            expect(result.redactionCount).toBe(0);

            // Re-enable for other tests
            redactor.setEnabled(true);
        });

        it('should allow disabling specific rules', () => {
            redactor.setRuleEnabled('email', false);
            const input = 'email: test@example.com, phone: 555-123-4567';
            const result = redactor.redact(input);

            expect(result.text).toContain('test@example.com');
            expect(result.text).not.toContain('555-123-4567');

            // Re-enable
            redactor.setRuleEnabled('email', true);
        });

        it('should support allowlist', () => {
            redactor.addToAllowlist('safe@example.com');
            const input = 'Contact: safe@example.com or other@example.com';
            const result = redactor.redact(input);

            expect(result.text).toContain('safe@example.com');
            expect(result.text).not.toContain('other@example.com');

            // Cleanup
            redactor.removeFromAllowlist('safe@example.com');
        });
    });

    describe('Analysis Functions', () => {
        it('should detect sensitive data', () => {
            const input = 'email: test@example.com, key: sk-ant-api03-abcdefghijklmnopqrstuvwx';
            const result = redactor.containsSensitiveData(input);

            expect(result.hasSensitive).toBe(true);
            expect(result.types).toContain('email');
            expect(result.types).toContain('anthropic-key');
        });

        it('should analyze text for redaction stats', () => {
            const input = 'emails: a@b.com, c@d.com, e@f.com';
            const stats = redactor.analyze(input);

            const emailStats = stats.find(s => s.ruleName === 'email');
            expect(emailStats).toBeDefined();
            expect(emailStats?.count).toBe(3);
        });
    });
});
