/**
 * Warm, time-aware greeting for the Today card.
 *   05–11 → "Good morning, Albi"
 *   12–17 → "Good afternoon, Albi"
 *   18–22 → "Good evening, Albi"
 *   23–04 → "Hello, night owl" (already addresses the user, so no name)
 * Only the first word of `name` is used; blank names are ignored.
 */
export function getTimeOfDayGreeting(name?: string, now: Date = new Date()): string {
  const hour = now.getHours();
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  const withName = (base: string) => (first ? `${base}, ${first}` : base);

  if (hour >= 5 && hour <= 11) return withName('Good morning');
  if (hour >= 12 && hour <= 17) return withName('Good afternoon');
  if (hour >= 18 && hour <= 22) return withName('Good evening');
  return 'Hello, night owl';
}
