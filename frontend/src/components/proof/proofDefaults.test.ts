import { describe, it, expect } from 'vitest';
import {
  IDLE_TIMER,
  defaultKind,
  focusMinutes,
  formatClock,
  orderedKinds,
  parseProofNumber,
  pauseTimer,
  proofSkipActive,
  proofSummary,
  startTimer,
  suggestedKinds,
  timerElapsedMs,
  timerRunning,
  unitsForPath,
  voiceLongEnough,
  voiceSeconds,
} from './proofDefaults';

describe('per-path proof suggestions', () => {
  it('suggests the plan’s defaults per path', () => {
    expect(suggestedKinds('fitness')).toEqual(['photo', 'number']);
    expect(suggestedKinds('fitness:cardio')).toEqual(['photo', 'number']);
    expect(suggestedKinds('language')).toEqual(['timer', 'voice']);
    expect(suggestedKinds('mindset')).toEqual(['timer', 'note']);
    expect(suggestedKinds('finance')).toEqual(['number', 'note']);
    expect(suggestedKinds('art')).toEqual(['photo', 'timer']);
    expect(suggestedKinds('coding')).toEqual(['note', 'photo']);
    expect(suggestedKinds(null)).toEqual(['note', 'photo']);
  });

  it('orders suggestions first, then the rest, limited to allowed kinds', () => {
    expect(orderedKinds('language')).toEqual(['timer', 'voice', 'photo', 'number', 'note']);
    expect(orderedKinds('language', ['photo', 'note'])).toEqual(['photo', 'note']);
    expect(orderedKinds('fitness', null, 'timer')[0]).toBe('timer');
    expect(defaultKind('finance')).toBe('number');
    expect(defaultKind('fitness', ['note'])).toBe('note');
    expect(defaultKind('art', ['timer'], 'photo')).toBe('timer');
  });

  it('offers unit chips per path', () => {
    expect(unitsForPath('fitness')[0]).toBe('reps');
    expect(unitsForPath('finance')).toEqual(['€']);
    expect(unitsForPath('unknown')).toEqual(['min', 'pages', 'reps']);
  });

  it('parses typed numbers', () => {
    expect(parseProofNumber('12,5')).toBe(12.5);
    expect(parseProofNumber(' 30 ')).toBe(30);
    expect(parseProofNumber('')).toBeNull();
    expect(parseProofNumber('abc')).toBeNull();
    expect(parseProofNumber('-')).toBeNull();
  });

  it('summarises proofs warmly', () => {
    expect(proofSummary({ kind: 'timer', minutes: 20 })).toBe('20 min focused');
    expect(proofSummary({ kind: 'number', number: 5, unit: 'km' })).toBe('5 km');
    expect(proofSummary({ kind: 'note', text: 'Ran' })).toBe('“Ran”');
  });
});

describe('focus timer math', () => {
  it('derives elapsed time from timestamps across pauses (survives background)', () => {
    let s = startTimer(IDLE_TIMER, 1_000);
    expect(timerRunning(s)).toBe(true);
    // App backgrounded for 10 minutes: nothing ticked, elapsed still counts.
    expect(timerElapsedMs(s, 1_000 + 600_000)).toBe(600_000);
    s = pauseTimer(s, 1_000 + 600_000);
    expect(timerRunning(s)).toBe(false);
    expect(timerElapsedMs(s, 9_999_999)).toBe(600_000);
    s = startTimer(s, 2_000_000);
    expect(startTimer(s, 2_000_500)).toBe(s); // start while running is a no-op
    expect(timerElapsedMs(s, 2_060_000)).toBe(660_000);
    expect(pauseTimer(IDLE_TIMER, 5)).toBe(IDLE_TIMER);
  });

  it('never goes negative when the clock moves back', () => {
    const s = startTimer(IDLE_TIMER, 10_000);
    expect(timerElapsedMs(s, 5_000)).toBe(0);
  });

  it('rounds to saved minutes', () => {
    expect(focusMinutes(10_000)).toBe(0);
    expect(focusMinutes(30_000)).toBe(1);
    expect(focusMinutes(89_000)).toBe(1);
    expect(focusMinutes(20 * 60_000 + 20_000)).toBe(20);
    expect(focusMinutes(24 * 3600_000)).toBe(720);
  });

  it('formats the clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(245_000)).toBe('4:05');
    expect(formatClock(3_729_000)).toBe('1:02:09');
  });
});

describe('voice limits and skip memory', () => {
  it('needs 10 s and caps at 60 s', () => {
    expect(voiceLongEnough(9_000)).toBe(false);
    expect(voiceLongEnough(9_900)).toBe(true);
    expect(voiceSeconds(61_400)).toBe(60);
    expect(voiceSeconds(12_600)).toBe(13);
  });

  it('remembers a skip for the same day only', () => {
    expect(proofSkipActive('2026-11-17', '2026-11-17')).toBe(true);
    expect(proofSkipActive('2026-11-16', '2026-11-17')).toBe(false);
    expect(proofSkipActive(null, '2026-11-17')).toBe(false);
  });
});
