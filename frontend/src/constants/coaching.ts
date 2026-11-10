/** Shown wherever a coaching plan or offer mentions payment. */
export const COACHING_BILLING_NOTE =
  'No payment through Grow! yet — agree payment directly with your coach.';

/** Short status label for an active coaching plan. */
export const COACHING_ACTIVE_STATUS = 'Plan active · pay your coach directly';

/** Limits enforced by the backend for coaching offers and proposals. */
export const COACHING_LIMITS = {
  weeklyFee: { min: 1, max: 500 },
  sessionsPerWeek: { min: 1, max: 7 },
  weeks: { min: 1, max: 26 },
  trialDays: { min: 0, max: 14 },
} as const;
