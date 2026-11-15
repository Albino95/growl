/**
 * Pure helpers for the Activity screen (no React Native imports → vitest):
 * day sections (Today / Yesterday / This week / Earlier) and collapsing a burst of
 * likes on the same post into one row: "ann and 3 others liked your post".
 */
import type { ActivityNotification } from '../../services/api/notifications';

/** SQLite `YYYY-MM-DD HH:MM:SS` (UTC, no zone) or ISO → epoch ms (NaN-safe → 0). */
export function serverTime(raw: string | null | undefined): number {
  const v = String(raw || '').trim();
  if (!v) return 0;
  let iso = v;
  if (/^\d{4}-\d{2}-\d{2} \d/.test(iso)) iso = iso.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(iso)) iso += 'Z';
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Compact age: now / 5m / 3h / 2d / 4w. */
export function timeAgo(raw: string, now: number = Date.now()): string {
  const t = serverTime(raw);
  if (!t) return '';
  const mins = Math.max(0, Math.floor((now - t) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export type DayBucket = 'Today' | 'Yesterday' | 'This week' | 'Earlier';
export const DAY_BUCKETS: DayBucket[] = ['Today', 'Yesterday', 'This week', 'Earlier'];

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local-calendar bucket for a notification time. */
export function dayBucket(raw: string, now: Date = new Date()): DayBucket {
  const t = serverTime(raw);
  const today = startOfLocalDay(now.getTime());
  if (!t || t >= today) return 'Today';
  const yesterday = startOfLocalDay(today - 1);
  if (t >= yesterday) return 'Yesterday';
  if (t >= today - 6 * 86_400_000) return 'This week';
  return 'Earlier';
}

/** Types that collapse per (type, ref) within a day bucket. */
const COLLAPSIBLE = new Set(['post_like']);

export type NotificationRow = {
  /** Stable list key (lead notification id). */
  key: string;
  /** Newest notification of the group — drives navigation, preview and avatar. */
  lead: ActivityNotification;
  /** Every notification folded into this row (lead first). */
  members: ActivityNotification[];
  /** Distinct other people beyond the lead actor. */
  others: number;
  unread: boolean;
  title: string;
};

export type NotificationSection = { title: DayBucket; data: NotificationRow[] };

function verbFor(type: string): string {
  if (type === 'post_like') return 'liked your post';
  return 'reacted';
}

/** "ann liked…", "ann and bob liked…", "ann and 3 others liked…". */
export function groupedTitle(names: string[], type: string): string {
  const verb = verbFor(type);
  const [a, b] = names;
  if (names.length <= 1) return `${a || 'Someone'} ${verb}`;
  if (names.length === 2) return `${a} and ${b} ${verb}`;
  const n = names.length - 1;
  return `${a} and ${n} ${n === 1 ? 'other' : 'others'} ${verb}`;
}

/**
 * Sections in DAY_BUCKETS order; rows keep server order (newest first). Likes on the
 * same post in the same bucket fold into the first (newest) row.
 */
export function groupNotifications(
  items: ActivityNotification[],
  now: Date = new Date()
): NotificationSection[] {
  const byBucket = new Map<DayBucket, NotificationRow[]>();
  const groupIndex = new Map<string, NotificationRow>();

  for (const n of items) {
    const bucket = dayBucket(n.created_at, now);
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    const rows = byBucket.get(bucket)!;
    const collapseKey =
      COLLAPSIBLE.has(n.type) && n.ref_id ? `${bucket}|${n.type}|${n.ref_id}` : null;
    const existing = collapseKey ? groupIndex.get(collapseKey) : undefined;
    if (existing) {
      existing.members.push(n);
      existing.unread = existing.unread || n.unread;
      continue;
    }
    const row: NotificationRow = {
      key: n.id,
      lead: n,
      members: [n],
      others: 0,
      unread: n.unread,
      title: n.title,
    };
    rows.push(row);
    if (collapseKey) groupIndex.set(collapseKey, row);
  }

  for (const row of groupIndex.values()) {
    if (row.members.length < 2) continue;
    const names: string[] = [];
    const seen = new Set<string>();
    for (const m of row.members) {
      const id = m.actor?.id || m.id;
      if (seen.has(id)) continue;
      seen.add(id);
      names.push(m.actor?.username || 'Someone');
    }
    row.others = Math.max(0, names.length - 1);
    if (names.length > 1) row.title = groupedTitle(names, row.lead.type);
  }

  return DAY_BUCKETS.filter((b) => (byBucket.get(b)?.length ?? 0) > 0).map((b) => ({
    title: b,
    data: byBucket.get(b)!,
  }));
}
