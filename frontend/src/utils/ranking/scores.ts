/** Shared scoring primitives for Feed, Explore, and Marketplace ranking. */

export function expandUserCategoryKeys(paths: string[]): Set<string> {
  const s = new Set<string>();
  for (const p of paths || []) {
    const x = String(p).trim().toLowerCase();
    if (!x) continue;
    s.add(x);
    const i = x.indexOf(':');
    if (i > 0) s.add(x.slice(0, i));
  }
  return s;
}

export function categoryScore(userKeys: Set<string>, category: string, sub?: string | null): number {
  const c = category.toLowerCase();
  const subKey = sub ? `${c}:${String(sub).toLowerCase()}` : '';
  let score = 0;
  if (userKeys.has(c)) score += 35;
  if (subKey && userKeys.has(subKey)) score += 55;
  for (const k of userKeys) {
    if (k.includes(':')) continue;
    if (c.startsWith(k) || k.startsWith(c)) score += 12;
  }
  return score;
}

/** Higher when created_at is recent; roughly fresh within ~48h wins most points */
export function recencyScore(iso: string, nowMs: number = Date.now()): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  const hours = (nowMs - t) / (1000 * 60 * 60);
  return Math.max(0, 48 - hours);
}

export function engagementScore(likes: number, comments: number, cap = 42): number {
  return Math.min(cap, (likes + comments) * 1.25);
}

export function jitter(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return (h % 100) / 100;
}

/** Human-readable label for why a product matches the user */
export function categoryMatchLabel(userPaths: string[], category: string, sub?: string | null): string | null {
  const keys = expandUserCategoryKeys(userPaths);
  const c = category.toLowerCase();
  const subKey = sub ? `${c}:${String(sub).toLowerCase()}` : '';
  if (subKey && keys.has(subKey)) {
    const label = String(sub).replace(/-/g, ' ');
    return `Matches your ${label} path`;
  }
  if (keys.has(c)) {
    return `Matches your ${category} journey`;
  }
  for (const k of keys) {
    if (!k.includes(':') && (c.startsWith(k) || k.startsWith(c))) {
      return `Related to ${k}`;
    }
  }
  return null;
}
