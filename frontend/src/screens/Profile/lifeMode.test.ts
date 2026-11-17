import { describe, it, expect } from 'vitest';
import { isLifeModeActive, lifeModeSubtitle, untilDateKey, untilOptionFor } from './lifeMode';

const NOW = new Date(2026, 10, 14, 15, 0); // Sat 14 Nov 2026, local

describe('life mode helpers', () => {
  it('builds local until dates and clamps to 30 days', () => {
    expect(untilDateKey(1, NOW)).toBe('2026-11-15');
    expect(untilDateKey(14, NOW)).toBe('2026-11-28');
    expect(untilDateKey(90, NOW)).toBe('2026-12-14');
  });
  it('is active through the until day, then off', () => {
    expect(isLifeModeActive({ mode: 'sick', until: '2026-11-14' }, NOW)).toBe(true);
    expect(isLifeModeActive({ mode: 'sick', until: '2026-11-13' }, NOW)).toBe(false);
    expect(isLifeModeActive({ mode: 'travel', until: null }, NOW)).toBe(true);
    expect(isLifeModeActive({ mode: 'none', until: null }, NOW)).toBe(false);
  });
  it('describes the current mode for the settings row', () => {
    expect(lifeModeSubtitle({ mode: 'travel', until: '2026-11-21' }, NOW)).toBe(
      'Travelling · until Sat 21 Nov',
    );
    expect(lifeModeSubtitle({ mode: 'break', until: null }, NOW)).toBe(
      'Taking a break · until you’re back',
    );
    expect(lifeModeSubtitle({ mode: 'none', until: null }, NOW)).toBe(
      'Pause your streak when life happens',
    );
  });
  it('maps a saved date back to its chip', () => {
    expect(untilOptionFor({ mode: 'sick', until: '2026-11-21' }, NOW)).toBe('1w');
    expect(untilOptionFor({ mode: 'sick', until: '2026-12-01' }, NOW)).toBe('saved');
  });
});
