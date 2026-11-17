import { COACHING_LIMITS } from '../../constants/coaching';

export type ProposalTemplate = {
  key: string;
  label: string;
  weeks: number;
  sessions: number;
  weekly: number;
  note: string;
};

type OfferLike = {
  weekly_fee_eur?: number | null;
  sessions_per_week?: number | null;
  typical_weeks?: number | null;
} | null | undefined;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Quick starts for the proposal composer, all derived from the coach's own offer
 * so the weekly fee never changes unless the coach edits it.
 */
export function proposalTemplates(offer: OfferLike): ProposalTemplate[] {
  const L = COACHING_LIMITS;
  const weekly = clamp(Number(offer?.weekly_fee_eur) || 10, L.weeklyFee.min, L.weeklyFee.max);
  const sessions = clamp(
    Math.floor(Number(offer?.sessions_per_week) || 3),
    L.sessionsPerWeek.min,
    L.sessionsPerWeek.max
  );
  const weeks = clamp(Math.floor(Number(offer?.typical_weeks) || 2), L.weeks.min, L.weeks.max);
  return [
    {
      key: 'offer',
      label: 'Your offer',
      weeks,
      sessions,
      weekly,
      note: 'Here’s the plan we talked about. Homework each week, and we check in after every session.',
    },
    {
      key: 'trial',
      label: 'Try 1 week',
      weeks: 1,
      sessions,
      weekly,
      note: 'Let’s start with one week to see if we work well together. No pressure to continue.',
    },
    {
      key: 'month',
      label: '4-week block',
      weeks: clamp(4, L.weeks.min, L.weeks.max),
      sessions,
      weekly,
      note: 'Four weeks gives us time to build a real habit. We’ll review progress at the halfway point.',
    },
    {
      key: 'light',
      label: 'Light touch',
      weeks,
      sessions: clamp(Math.min(sessions, 1), L.sessionsPerWeek.min, L.sessionsPerWeek.max),
      weekly,
      note: 'One session a week plus homework you do on your own time.',
    },
  ];
}
