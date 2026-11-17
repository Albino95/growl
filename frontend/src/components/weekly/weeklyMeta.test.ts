import { describe, it, expect } from 'vitest';
import {
  cleanAnswers,
  commitmentProgressLabel,
  commitmentResultCopy,
  commitmentSubline,
  hasAnswer,
  ringPositions,
  shouldShowWeeklyCard,
  weekdayLetter,
} from './weeklyMeta';
import type { WeeklyCommitment, WeeklyQuestion } from '../../services/api/weekly';

const base: WeeklyCommitment = {
  id: 'w',
  week: '2026-W46',
  week_start: '2026-11-09',
  target_days: 5,
  passes_total: 2,
  passes_used: 1,
  pass_days: ['2026-11-10'],
  active_days: 2,
  covered: 3,
  remaining: 2,
  reachable: true,
  status: 'active',
  points_awarded: 0,
  settled_at: null,
  days: [],
};

describe('weeklyMeta', () => {
  it('gates the card per week', () => {
    expect(shouldShowWeeklyCard(null, null)).toBe(false);
    expect(shouldShowWeeklyCard('2026-W46', '2026-W45')).toBe(true);
    expect(shouldShowWeeklyCard('2026-W46', '2026-W46')).toBe(false);
  });

  it('progress copy', () => {
    expect(commitmentProgressLabel(base)).toBe('3 of 5 days');
    expect(commitmentSubline(base)).toBe('2 more days to go · 1 rest pass left');
    expect(commitmentSubline({ ...base, covered: 5 })).toMatch(/Goal reached/);
    expect(commitmentSubline({ ...base, reachable: false })).toBe('Every day you show up still counts.');
  });

  it('never says failed', () => {
    const partly = commitmentResultCopy({ ...base, status: 'partly', covered: 4 });
    expect(partly.title).toBe('Partly counts — 4 of 5 days');
    expect(partly.body).toBe('Try again this week?');
    expect(commitmentResultCopy({ ...base, status: 'kept', covered: 5, points_awarded: 10 }).body).toBe(
      '5 of 5 days · +10 points'
    );
    for (const c of [0, 1, 4]) {
      const copy = commitmentResultCopy({ ...base, status: 'partly', covered: c });
      expect(`${copy.title} ${copy.body}`).not.toMatch(/fail|missed|lost/i);
    }
  });

  it('cleans answers', () => {
    const qs: WeeklyQuestion[] = [
      { id: 'feel', type: 'scale', prompt: 'x' },
      { id: 'well', type: 'text', prompt: 'y' },
      { id: 'way', type: 'chips', prompt: 'z', options: ['Time'], allow_text: true },
    ];
    expect(hasAnswer('  ')).toBe(false);
    expect(hasAnswer({ chips: [], text: ' ' })).toBe(false);
    expect(cleanAnswers(qs, { feel: 3, well: ' ok ', way: { chips: ['Time'], text: ' ' }, extra: 'x' })).toEqual({
      feel: 3,
      well: 'ok',
      way: { chips: ['Time'] },
    });
  });

  it('ring positions start at 12 o’clock', () => {
    const p = ringPositions(4, 10);
    expect(p[0]).toEqual({ x: 0, y: -10 });
    expect(p[1]).toEqual({ x: 10, y: 0 });
    expect(weekdayLetter('2026-11-09')).toBe('M');
  });
});
