/**
 * Ranking helpers for Explore people search.
 * Supports substring matches plus near-miss usernames (extra letter, typo).
 */

/** Collapse consecutive repeated characters: vasianndreu → vasiandreu */
export function collapseRepeats(s: string): string {
  return s.replace(/(.)\1+/g, '$1');
}

/** Levenshtein distance with early exit when distance would exceed `max`. */
export function levenshtein(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = new Array<number>(cols);
  let curr = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Lower rank = better match. `null` means not similar enough to surface.
 */
export function usernameSearchRank(candidate: string, query: string): number | null {
  const u = candidate.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!u || !q) return null;
  if (u === q) return 0;
  if (u.startsWith(q)) return 1;
  if (u.includes(q) || q.includes(u)) return 2;

  const cu = collapseRepeats(u);
  const cq = collapseRepeats(q);
  if (cu === cq) return 3;
  if (cu.startsWith(cq) || cu.includes(cq) || cq.includes(cu)) return 4;

  const maxDist = q.length >= 6 ? 2 : 1;
  const d = levenshtein(u, q, maxDist);
  if (d <= maxDist) return 5 + d;
  const dCollapsed = levenshtein(cu, cq, maxDist);
  if (dCollapsed <= maxDist) return 7 + dCollapsed;
  return null;
}
