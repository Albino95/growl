/**
 * A friend-invite code captured from a deep link (growl://invite/:code) while
 * signed out. The Auth sign-up form reads it to prefill its "Invite code"
 * field; it is cleared once a sign-up request carrying it succeeds.
 */
import { deleteSecureItem, getSecureItem, setSecureItem } from './secureStore';

const KEY = 'grow.pending_invite_code';

type Listener = (code: string | null) => void;
const listeners = new Set<Listener>();

/** Normalise user-typed / linked codes: trim, upper-case, strip spaces and dashes. */
export function normalizeInviteCode(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[\s-]+/g, '').toUpperCase().slice(0, 32);
}

export async function savePendingInviteCode(code: string): Promise<void> {
  const clean = normalizeInviteCode(code);
  if (!clean) return;
  await setSecureItem(KEY, clean);
  listeners.forEach((l) => l(clean));
}

export async function loadPendingInviteCode(): Promise<string | null> {
  const v = await getSecureItem(KEY);
  return v ? normalizeInviteCode(v) : null;
}

export async function clearPendingInviteCode(): Promise<void> {
  await deleteSecureItem(KEY);
  listeners.forEach((l) => l(null));
}

/** Notified when a code is saved/cleared while a screen is already mounted. */
export function subscribePendingInviteCode(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
