type EmailSignInInput = { ok: true; email: string } | { ok: false; error: string };
type EmailSignUpInput = { ok: true; email: string; name: string } | { ok: false; error: string };

/** Mirrors `minPasswordLength` in the Better Auth server config. */
export const MIN_PASSWORD_LENGTH = 10;

export function validateEmailAddress(email: string): EmailSignInInput {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail.includes('@')) {
    return { ok: false, error: 'Enter a valid email address.' };
  }

  return { ok: true, email: normalizedEmail };
}

export function validateEmailSignIn(email: string, password: string): EmailSignInInput {
  const address = validateEmailAddress(email);
  if (!address.ok) return address;
  if (!password) {
    return { ok: false, error: 'Enter your password.' };
  }

  return address;
}

export function validateEmailSignUp(name: string, email: string, password: string): EmailSignUpInput {
  const trimmedName = name.trim();
  const address = validateEmailAddress(email);

  if (!trimmedName) {
    return { ok: false, error: 'Enter your name.' };
  }
  if (!address.ok) return address;
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  return { ok: true, email: address.email, name: trimmedName };
}

export function validatePasswordReset(password: string, confirmation: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false as const, error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > 256) {
    return { ok: false as const, error: 'Use a password with no more than 256 characters.' };
  }
  if (password !== confirmation) {
    return { ok: false as const, error: 'The passwords do not match.' };
  }
  return { ok: true as const, password };
}

export function requiresTwoFactor(data: unknown) {
  return Boolean(data && typeof data === 'object' && 'twoFactorRedirect' in data && data.twoFactorRedirect === true);
}
