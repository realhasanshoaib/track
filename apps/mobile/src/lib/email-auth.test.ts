import { describe, expect, it } from 'vitest';

import { MIN_PASSWORD_LENGTH, validateEmailAddress, validateEmailSignUp, validatePasswordReset } from './email-auth';

describe('email authentication input', () => {
  it('normalizes valid email addresses and rejects missing addresses', () => {
    expect(validateEmailAddress('  Alex@Example.com ')).toEqual({ ok: true, email: 'alex@example.com' });
    expect(validateEmailAddress('invalid')).toEqual({ ok: false, error: 'Enter a valid email address.' });
  });

  it('uses the server password minimum for sign-up and reset', () => {
    const shortPassword = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateEmailSignUp('Alex', 'alex@example.com', shortPassword)).toEqual({
      ok: false,
      error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
    expect(validatePasswordReset(shortPassword, shortPassword).ok).toBe(false);
    expect(validatePasswordReset('long-enough-password', 'different-password')).toEqual({
      ok: false,
      error: 'The passwords do not match.',
    });
    expect(validatePasswordReset('long-enough-password', 'long-enough-password')).toEqual({
      ok: true,
      password: 'long-enough-password',
    });
  });
});
