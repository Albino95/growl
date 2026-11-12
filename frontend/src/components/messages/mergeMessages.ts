import type { ChatMessage } from '../../services/api/messages';

/** Optimistic (still sending) and failed sends live only on the device until the server has them. */
export function isLocalOnlyMessage(m: ChatMessage): boolean {
  return m.id.startsWith('temp-');
}

function timeOf(iso: string): number {
  const raw = String(iso || '').trim();
  const normalized = /T/.test(raw) ? raw : raw.replace(' ', 'T') + (raw.endsWith('Z') ? '' : 'Z');
  const t = new Date(normalized).getTime();
  return Number.isFinite(t) ? t : 0;
}

function byTimeThenId(a: ChatMessage, b: ChatMessage): number {
  const d = timeOf(a.created_at) - timeOf(b.created_at);
  if (d !== 0) return d;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Merge a server page into what is on screen:
 * - server copies win for ids both sides have (fresh reactions/body),
 * - older pages already loaded locally are kept,
 * - temp-/failed local sends stay at the end, in the order they were sent,
 * - every id appears once.
 */
export function mergeMessages(local: ChatMessage[], server: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of local) {
    if (!isLocalOnlyMessage(m)) byId.set(m.id, m);
  }
  for (const m of server) byId.set(m.id, m);
  const confirmed = Array.from(byId.values()).sort(byTimeThenId);
  const pending = local.filter((m) => isLocalOnlyMessage(m) && !byId.has(m.id));
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const m of [...confirmed, ...pending]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/** Replace an optimistic temp message with the saved one (or drop it if a poll already delivered it). */
export function confirmSentMessage(
  local: ChatMessage[],
  tempId: string,
  saved: ChatMessage
): ChatMessage[] {
  if (local.some((m) => m.id === saved.id)) return local.filter((m) => m.id !== tempId);
  return local.map((m) => (m.id === tempId ? { ...saved, is_own: true } : m));
}
