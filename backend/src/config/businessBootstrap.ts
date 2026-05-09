import type { Env } from '../types';

/**
 * Built-in demo emails that receive is_business on sign-in if missing.
 * Add production/staging accounts via wrangler var BUSINESS_BOOTSTRAP_EMAILS (comma-separated).
 */
const DEFAULT_BUSINESS_BOOTSTRAP_EMAILS: readonly string[] = ['business@growl.app'];

function emailsFromEnv(env: Env): string[] {
  const raw = env.BUSINESS_BOOTSTRAP_EMAILS;
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function shouldBootstrapBusinessPrivileges(email: string, env: Env): boolean {
  const normalized = email.trim().toLowerCase();
  const set = new Set([...DEFAULT_BUSINESS_BOOTSTRAP_EMAILS, ...emailsFromEnv(env)]);
  return set.has(normalized);
}
