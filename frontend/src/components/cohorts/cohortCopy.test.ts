import { describe, it, expect } from 'vitest';
import {
  codeFromText,
  dayKey,
  dueChoices,
  formatCode,
  homeworkStatusLabel,
  nextMonday,
  normalizeCode,
  shareMessage,
  shortAgo,
  startChoices,
  weekLabel,
} from './cohortCopy';

describe('cohortCopy', () => {
  it('formats and normalizes invite codes', () => {
    expect(formatCode('ABCD2345')).toBe('ABCD-2345');
    expect(normalizeCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeCode('oil12345')).toBe('01112345');
    expect(normalizeCode('short')).toBeNull();
    expect(codeFromText('Join: growl://cohort/ABCD2345')).toBe('ABCD2345');
    expect(codeFromText('abcd-2345')).toBe('ABCD2345');
  });

  it('builds a share message with code + deep link', () => {
    const msg = shareMessage({ title: 'Run club', invite_code: 'ABCD2345', invite_link: 'growl://cohort/ABCD2345' }, 'Mia');
    expect(msg).toContain('ABCD-2345');
    expect(msg).toContain('growl://cohort/ABCD2345');
    expect(msg).toContain('Run club');
  });

  it('computes local day choices', () => {
    const wed = new Date(2026, 10, 11); // Wed 11 Nov 2026
    expect(dayKey(nextMonday(wed))).toBe('2026-11-16');
    const mon = new Date(2026, 10, 16);
    expect(dayKey(nextMonday(mon))).toBe('2026-11-23');
    expect(dayKey(nextMonday(mon, true))).toBe('2026-11-16');
    expect(startChoices(wed).map((c) => c.key)).toEqual(['2026-11-11', '2026-11-16', '2026-11-23']);
    expect(dueChoices(wed)[0].key).toBeNull();
    expect(dueChoices(wed)[2].key).toBe('2026-11-12');
  });

  it('uses warm labels', () => {
    expect(homeworkStatusLabel('partly')).toBe('Partly counts');
    expect(homeworkStatusLabel('assigned')).toBe('Not yet');
    expect(weekLabel({ current_week: 2, weeks: 4, start_date: '2026-11-02', status: 'active' })).toBe('Week 2 of 4');
    expect(weekLabel({ current_week: 5, weeks: 4, start_date: '2026-11-02', status: 'active' })).toBe('Finished');
    expect(weekLabel({ current_week: 2, weeks: 4, start_date: '2026-11-02', status: 'archived' })).toBe('Archived');
  });

  it('formats short relative times from SQLite stamps', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    expect(shortAgo('2026-11-10 11:30:00', now)).toBe('30m');
    expect(shortAgo('2026-11-10 09:00:00', now)).toBe('3h');
    expect(shortAgo('2026-11-08 12:00:00', now)).toBe('2d');
  });
});
