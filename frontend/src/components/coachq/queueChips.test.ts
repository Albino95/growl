import { describe, expect, it } from 'vitest';
import { proofChipLabel, todayEntrySummary } from './queueFormat';

describe('proofChipLabel', () => {
  it('renders compact chips for non-photo proofs', () => {
    expect(proofChipLabel({ kind: 'number', number: 25, unit: 'reps' })).toBe('🔢 25 reps');
    expect(proofChipLabel({ kind: 'number', number: 2.5 })).toBe('🔢 2.5');
    expect(proofChipLabel({ kind: 'timer', minutes: 12 })).toBe('⏱ 12 min');
    expect(proofChipLabel({ kind: 'note' })).toBe('✏️ note');
    expect(proofChipLabel({ kind: 'voice', duration_s: 24 })).toBe('🎙 0:24');
    expect(proofChipLabel({ kind: 'voice' })).toBe('🎙 voice');
  });
});

describe('todayEntrySummary', () => {
  it('mentions review items even when everyone is on track', () => {
    expect(todayEntrySummary({ red: 0, amber: 0, review: 1 })).toEqual({
      subtitle: '1 to review · everyone’s on track',
      badge: 1,
      badgeTone: 'review',
    });
  });

  it('red wins the badge', () => {
    const s = todayEntrySummary({ red: 2, amber: 1, review: 3 });
    expect(s.subtitle).toBe('3 to review · 2 need you today');
    expect(s.badge).toBe(2);
    expect(s.badgeTone).toBe('red');
  });

  it('no badge when nothing is pending', () => {
    expect(todayEntrySummary({ red: 0, amber: 0, review: 0 })).toEqual({
      subtitle: 'Everyone’s on track',
      badge: 0,
      badgeTone: null,
    });
    expect(todayEntrySummary({ red: 0, amber: 2, review: 0 }).subtitle).toBe('2 to check this week');
  });
});
