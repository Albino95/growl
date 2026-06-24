export type PasswordCheck = { ok: boolean; message?: string };

export function validatePasswordStrength(password: string): PasswordCheck {
  if (password.length < 12) {
    return { ok: false, message: 'At least 12 characters' };
  }
  if (password.length > 128) {
    return { ok: false, message: 'Maximum 128 characters' };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: 'Include a lowercase letter' };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: 'Include an uppercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: 'Include a number' };
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return { ok: false, message: 'Include a symbol' };
  }
  return { ok: true };
}
