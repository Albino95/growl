import type { Buddy, BuddyUser } from '../../services/api/buddies';

/** First name for buddy copy ("Waiting on Lea today"), else the username. */
export function buddyName(u: Pick<BuddyUser, 'display_name' | 'username'>): string {
  const full = (u.display_name || '').trim();
  if (full) return full.split(/\s+/)[0];
  return u.username;
}

/** "3 days together" / "New pair". Calm count, no flames. */
export function buddyStreakLabel(streak: number): string {
  if (streak <= 0) return 'New pair';
  return `${streak} ${streak === 1 ? 'day' : 'days'} together`;
}

/** Gentle state for today, never a guilt line. */
export function buddyTodayLine(b: Pick<Buddy, 'today' | 'streak' | 'user'>): string {
  const name = buddyName(b.user);
  if (b.today.me && b.today.them) return 'You both showed up today';
  if (b.today.me) return `Waiting on ${name} today`;
  if (b.today.them) return `${name} showed up — your turn whenever you’re ready`;
  return b.streak > 0 ? 'Show up together today to keep it growing' : 'Your first shared day can be today';
}

/** One line for the TodayCard: "2 buddies showed up today". */
export function buddiesTodaySummary(buddies: Pick<Buddy, 'today'>[]): string | null {
  if (!buddies.length) return null;
  const n = buddies.filter((b) => b.today.them).length;
  if (n > 0) return `${n} ${n === 1 ? 'buddy' : 'buddies'} showed up today`;
  return `Growing with ${buddies.length} ${buddies.length === 1 ? 'buddy' : 'buddies'}`;
}
