import { describe, it, expect } from 'vitest';
import { proposalTemplates } from './proposalTemplates';

describe('proposalTemplates', () => {
  it('derives every template from the coach offer and keeps the weekly fee', () => {
    const t = proposalTemplates({ weekly_fee_eur: 25, sessions_per_week: 3, typical_weeks: 6 });
    expect(t.map((x) => x.key)).toEqual(['offer', 'trial', 'month', 'light']);
    expect(t.every((x) => x.weekly === 25)).toBe(true);
    expect(t[0]).toMatchObject({ weeks: 6, sessions: 3 });
    expect(t[1].weeks).toBe(1);
    expect(t[2].weeks).toBe(4);
    expect(t[3].sessions).toBe(1);
    expect(t.every((x) => x.note.length > 0)).toBe(true);
  });

  it('falls back to defaults and clamps to backend limits', () => {
    expect(proposalTemplates(null)[0]).toMatchObject({ weekly: 10, sessions: 3, weeks: 2 });
    const t = proposalTemplates({ weekly_fee_eur: 9999, sessions_per_week: 12, typical_weeks: 80 });
    expect(t[0]).toMatchObject({ weekly: 500, sessions: 7, weeks: 26 });
  });

  it('never mentions in-app payment', () => {
    for (const x of proposalTemplates(null)) expect(x.note).not.toMatch(/pay|charge|billing/i);
  });
});
