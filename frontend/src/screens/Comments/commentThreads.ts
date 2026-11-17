/**
 * One-level comment threads (pure → vitest). Input is chronological (oldest first);
 * output keeps top-level comments in that order with each one's replies right below
 * it (also chronological). A reply whose parent isn't loaded (older page, deleted)
 * stays at its own position as a top-level row so nothing disappears.
 */
export type ThreadableComment = { id: string; parent_id?: string | null };

export type ThreadedRow<T extends ThreadableComment> = {
  comment: T;
  depth: 0 | 1;
  /** Top-level id this row belongs to (itself for depth 0). */
  threadId: string;
};

export function threadComments<T extends ThreadableComment>(rows: T[]): ThreadedRow<T>[] {
  const ids = new Set(rows.map((r) => r.id));
  const replies = new Map<string, T[]>();
  const tops: T[] = [];
  for (const r of rows) {
    const p = r.parent_id || null;
    if (p && p !== r.id && ids.has(p)) {
      if (!replies.has(p)) replies.set(p, []);
      replies.get(p)!.push(r);
    } else {
      tops.push(r);
    }
  }
  const out: ThreadedRow<T>[] = [];
  for (const t of tops) {
    out.push({ comment: t, depth: 0, threadId: t.id });
    // A parent that is itself a reply (shouldn't happen server-side) still nests one level.
    for (const r of replies.get(t.id) ?? []) out.push({ comment: r, depth: 1, threadId: t.id });
  }
  return out;
}

/** Ids removed when `id` is deleted: the comment plus its direct replies. */
export function idsRemovedWith<T extends ThreadableComment>(rows: T[], id: string): Set<string> {
  const out = new Set([id]);
  for (const r of rows) if (r.parent_id === id) out.add(r.id);
  return out;
}
