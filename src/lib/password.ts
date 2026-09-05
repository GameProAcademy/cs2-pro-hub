/**
 * Password rules shared by sign-up, reset and the profile change form.
 * Nothing here persists, logs or transmits a password.
 */
export const PASSWORD_MIN_LENGTH = 8;

export type PasswordStrength = "weak" | "fair" | "strong";

export function passwordStrength(value: string): PasswordStrength {
  let score = 0;
  if (value.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  if (score >= 4) return "strong";
  if (score >= 2) return "fair";
  return "weak";
}

export type PasswordFormError =
  | "currentRequired"
  | "tooShort"
  | "mismatch"
  | "sameAsCurrent"
  | null;

/** Pure validation of the change-password form. */
export function validatePasswordChange(input: {
  current: string;
  next: string;
  confirm: string;
}): PasswordFormError {
  if (!input.current) return "currentRequired";
  if (input.next.length < PASSWORD_MIN_LENGTH) return "tooShort";
  if (input.next !== input.confirm) return "mismatch";
  if (input.next === input.current) return "sameAsCurrent";
  return null;
}
