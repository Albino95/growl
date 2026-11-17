/**
 * Request account data export or deletion (GDPR / store compliance).
 */
import { ApiError, request } from './http';

export type AccountExportPayload = {
  user: Record<string, unknown>;
  posts: unknown[];
  comments: unknown[];
  orders: unknown[];
  reports: unknown[];
  exported_at: string;
};

export async function exportAccountData(): Promise<AccountExportPayload> {
  const res = await request<{ success: boolean; data: AccountExportPayload }>('/privacy/export', {
    method: 'GET',
  });
  if (!res.success || !res.data) {
    throw new Error('Failed to export account data');
  }
  return res.data;
}

export async function deleteAccount(confirm = 'DELETE'): Promise<{ ok: boolean; message: string }> {
  const res = await request<{ success: boolean; data: { ok: boolean; message: string } }>(
    '/privacy/delete-account',
    {
      method: 'POST',
      body: JSON.stringify({ confirm }),
    },
  );
  if (!res.success || !res.data?.ok) {
    throw new Error('Failed to delete account');
  }
  return res.data;
}

// ── Privacy & safety settings ─────────────────────────────────────────────

/**
 * True when the server says the route doesn't exist (backend not deployed yet).
 * Decides on the ApiError status; the message match (router copy "Route not
 * found: …" / generic "Request failed (404)") is a fallback for plain errors.
 */
export function isEndpointMissingError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 404;
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!msg) return false;
  return /route not found/i.test(msg) || /\(404\)/.test(msg);
}

/** Result of a call that may hit a not-yet-deployed endpoint. */
export type MaybeAvailable<T> = { available: true; data: T } | { available: false };

/** Runs `fn`; a missing endpoint resolves to `{ available: false }`, other errors rethrow. */
export async function whenAvailable<T>(fn: () => Promise<T>): Promise<MaybeAvailable<T>> {
  try {
    return { available: true, data: await fn() };
  } catch (e: unknown) {
    if (isEndpointMissingError(e)) return { available: false };
    throw e;
  }
}

export type BlockedUser = {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  blocked_at?: string | null;
};

/** Normalises `data` that may be the list itself or wrapped (`{ blocks: [...] }`). */
export function normalizeBlockedList(data: unknown): BlockedUser[] {
  const raw = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as Record<string, unknown>).blocks ??
        (data as Record<string, unknown>).users ??
        (data as Record<string, unknown>).items)
      : null;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((u): u is Record<string, unknown> => !!u && typeof u === 'object' && !!(u as any).id)
    .map((u) => ({
      id: String(u.id),
      username: String(u.username ?? ''),
      display_name: (u.display_name as string | null | undefined) ?? null,
      avatar_url: ((u.avatar_url ?? u.avatar) as string | null | undefined) ?? null,
      blocked_at: (u.blocked_at as string | null | undefined) ?? null,
    }));
}

export async function listBlockedUsers(): Promise<BlockedUser[]> {
  const res = await request<{ success: boolean; data: unknown }>('/social/blocks');
  return normalizeBlockedList(res?.data);
}

export type DmPolicy = 'everyone' | 'friends' | 'nobody';
export type PrivacySettings = { dm_policy: DmPolicy };

const DM_POLICIES: DmPolicy[] = ['everyone', 'friends', 'nobody'];

function toPrivacy(data: unknown): PrivacySettings {
  const p = (data as { dm_policy?: unknown } | null)?.dm_policy;
  return { dm_policy: DM_POLICIES.includes(p as DmPolicy) ? (p as DmPolicy) : 'everyone' };
}

export async function getPrivacy(): Promise<PrivacySettings> {
  const res = await request<{ success: boolean; data: unknown }>('/me/privacy');
  return toPrivacy(res?.data);
}

export async function setPrivacy(settings: PrivacySettings): Promise<PrivacySettings> {
  const res = await request<{ success: boolean; data: unknown }>('/me/privacy', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return res?.data ? toPrivacy(res.data) : settings;
}

export type LifeModeKind = 'none' | 'sick' | 'travel' | 'break';
export type LifeMode = { mode: LifeModeKind; until: string | null };

const LIFE_MODES: LifeModeKind[] = ['none', 'sick', 'travel', 'break'];

export function toLifeMode(data: unknown): LifeMode {
  const d = (data ?? {}) as { mode?: unknown; until?: unknown };
  const mode = LIFE_MODES.includes(d.mode as LifeModeKind) ? (d.mode as LifeModeKind) : 'none';
  const until =
    mode !== 'none' && typeof d.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.until)
      ? d.until
      : null;
  return { mode, until };
}

export async function getLifeMode(): Promise<LifeMode> {
  const res = await request<{ success: boolean; data: unknown }>('/me/life-mode');
  return toLifeMode(res?.data);
}

export async function setLifeMode(next: LifeMode): Promise<LifeMode> {
  const body: { mode: LifeModeKind; until?: string } = { mode: next.mode };
  if (next.mode !== 'none' && next.until) body.until = next.until;
  const res = await request<{ success: boolean; data: unknown }>('/me/life-mode', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return res?.data ? toLifeMode(res.data) : toLifeMode(next);
}
