import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTapSoundLimiter,
  createVariantPicker,
  migrateUiPrefs,
  runHapticSequence,
  soundAllowed,
  tapGainJitter,
  feedbackConfig,
  HAPTIC_SEQUENCES,
  SOUND_KEYS,
  TAP_RATE_LIMIT_MS,
  TAP_SOUND_KEYS,
  type HapticStep,
  type TapSoundKey,
  type UiSoundKey,
} from './hapticsCore';

describe('sound level gating', () => {
  const subtleTaps: TapSoundKey[] = ['tapLike', 'tapToggleOn', 'tapToggleOff', 'tapCommit'];
  const fullOnlyTaps: TapSoundKey[] = ['tapTab', 'tapChip', 'tapRefresh'];

  it('Off plays nothing', () => {
    for (const key of [...SOUND_KEYS, ...TAP_SOUND_KEYS] as UiSoundKey[]) {
      expect(soundAllowed('off', key)).toBe(false);
    }
  });

  it('Subtle = signature five + like, toggle, commit', () => {
    for (const key of SOUND_KEYS) expect(soundAllowed('subtle', key)).toBe(true);
    for (const key of subtleTaps) expect(soundAllowed('subtle', key)).toBe(true);
    for (const key of fullOnlyTaps) expect(soundAllowed('subtle', key)).toBe(false);
  });

  it('Full = everything', () => {
    for (const key of [...SOUND_KEYS, ...TAP_SOUND_KEYS] as UiSoundKey[]) {
      expect(soundAllowed('full', key)).toBe(true);
    }
  });

  it('gates the kinds the app actually fires', () => {
    const allowed = (kind: Parameters<typeof feedbackConfig>[0], level: 'subtle' | 'full') =>
      soundAllowed(level, feedbackConfig(kind).sound!);
    expect(allowed('like', 'subtle')).toBe(true);
    expect(allowed('commit', 'subtle')).toBe(true);
    expect(allowed('toggleOn', 'subtle')).toBe(true);
    expect(allowed('tab', 'subtle')).toBe(false);
    expect(allowed('chip', 'subtle')).toBe(false);
    expect(allowed('refreshThreshold', 'subtle')).toBe(false);
    expect(allowed('chip', 'full')).toBe(true);
  });
});

describe('ui prefs migration (soundEnabled → soundLevel)', () => {
  it('maps false → off and true → subtle, dropping the old key', () => {
    expect(migrateUiPrefs({ soundEnabled: false, hapticsEnabled: true }, 1)).toEqual({
      soundLevel: 'off',
      hapticsEnabled: true,
    });
    expect(migrateUiPrefs({ soundEnabled: true, hapticsEnabled: false, appearance: 'dark' }, 1)).toEqual({
      soundLevel: 'subtle',
      hapticsEnabled: false,
      appearance: 'dark',
    });
  });

  it('defaults a missing / corrupt blob to subtle and keeps a valid v2 level', () => {
    expect(migrateUiPrefs(undefined, 0)).toEqual({ soundLevel: 'subtle' });
    expect(migrateUiPrefs({ soundLevel: 'full' }, 2)).toEqual({ soundLevel: 'full' });
    expect(migrateUiPrefs({ soundLevel: 'loud' }, 2)).toEqual({ soundLevel: 'subtle' });
  });
});

describe('tap sound rate limit (drop, never queue)', () => {
  afterEach(() => vi.useRealTimers());

  it('drops a repeat of the same class inside 90 ms', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const limiter = createTapSoundLimiter();
    expect(limiter.allow('tapChip')).toBe(true);
    vi.advanceTimersByTime(TAP_RATE_LIMIT_MS.perClass - 1);
    expect(limiter.allow('tapChip')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(limiter.allow('tapChip')).toBe(true);
  });

  it('drops any tap inside 50 ms of the last one, and toggle on/off share a class', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = createTapSoundLimiter();
    expect(limiter.allow('tapToggleOn')).toBe(true);
    vi.advanceTimersByTime(TAP_RATE_LIMIT_MS.global - 1);
    expect(limiter.allow('tapLike')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(limiter.allow('tapLike')).toBe(true);
    vi.advanceTimersByTime(TAP_RATE_LIMIT_MS.global);
    // 100 ms since toggle-on but toggle-off is the same class: allowed (>= 90).
    expect(limiter.allow('tapToggleOff')).toBe(true);
    vi.advanceTimersByTime(60);
    expect(limiter.allow('tapToggleOn')).toBe(false);
  });

  it('a dropped call does not extend the window (nothing is queued)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = createTapSoundLimiter();
    expect(limiter.allow('tapCommit')).toBe(true);
    vi.advanceTimersByTime(80);
    expect(limiter.allow('tapCommit')).toBe(false);
    vi.advanceTimersByTime(10);
    expect(limiter.allow('tapCommit')).toBe(true);
    // Nothing fires later on its own.
    vi.advanceTimersByTime(1000);
  });
});

describe('variant picker', () => {
  it('never repeats the same variant twice in a row', () => {
    const picker = createVariantPicker(3);
    let prev = -1;
    for (let i = 0; i < 500; i++) {
      const v = picker.next('tapChip');
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(3);
      expect(v).not.toBe(prev);
      prev = v;
    }
  });

  it('re-rolls a forced repeat onto another variant and tracks keys independently', () => {
    const picker = createVariantPicker(3, () => 0); // random always picks 0
    expect(picker.next('a')).toBe(0);
    expect(picker.next('a')).toBe(1);
    expect(picker.next('a')).toBe(0);
    expect(picker.next('b')).toBe(0);
  });

  it('uses every variant over time', () => {
    const picker = createVariantPicker(3);
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) seen.add(picker.next('x'));
    expect(seen.size).toBe(3);
  });

  it('jitters gain within ±1.5 dB', () => {
    expect(tapGainJitter(() => 0)).toBeCloseTo(10 ** (-1.5 / 20), 6);
    expect(tapGainJitter(() => 1)).toBeCloseTo(10 ** (1.5 / 20), 6);
    expect(tapGainJitter(() => 0.5)).toBeCloseTo(1, 6);
  });
});

describe('haptic sequences', () => {
  afterEach(() => vi.useRealTimers());

  function record(steps: readonly HapticStep[], enabled = () => true) {
    const fired: { t: number; channel: string }[] = [];
    const start = Date.now();
    const cancel = runHapticSequence(steps, (channel) => fired.push({ t: Date.now() - start, channel }), {
      enabled,
    });
    return { fired, cancel };
  }

  it('checkin: soft@0, medium@90, success@220', () => {
    vi.useFakeTimers();
    const { fired } = record(HAPTIC_SEQUENCES.checkin);
    expect(fired).toEqual([{ t: 0, channel: 'soft' }]);
    vi.advanceTimersByTime(500);
    expect(fired).toEqual([
      { t: 0, channel: 'soft' },
      { t: 90, channel: 'impactMedium' },
      { t: 220, channel: 'success' },
    ]);
  });

  it('celebrate: light@0, light@80, medium@160, heavy@260, success@420', () => {
    vi.useFakeTimers();
    const { fired } = record(HAPTIC_SEQUENCES.celebrate);
    vi.advanceTimersByTime(1000);
    expect(fired).toEqual([
      { t: 0, channel: 'impactLight' },
      { t: 80, channel: 'impactLight' },
      { t: 160, channel: 'impactMedium' },
      { t: 260, channel: 'impactHeavy' },
      { t: 420, channel: 'success' },
    ]);
  });

  it('likeDoubleTap: rigid@0, soft@70', () => {
    vi.useFakeTimers();
    const { fired } = record(HAPTIC_SEQUENCES.likeDoubleTap);
    vi.advanceTimersByTime(200);
    expect(fired).toEqual([
      { t: 0, channel: 'rigid' },
      { t: 70, channel: 'soft' },
    ]);
  });

  it('is skipped entirely when haptics are off', () => {
    vi.useFakeTimers();
    const { fired } = record(HAPTIC_SEQUENCES.celebrate, () => false);
    vi.advanceTimersByTime(1000);
    expect(fired).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops mid-pattern when haptics are switched off', () => {
    vi.useFakeTimers();
    let on = true;
    const { fired } = record(HAPTIC_SEQUENCES.checkin, () => on);
    vi.advanceTimersByTime(100);
    on = false;
    vi.advanceTimersByTime(500);
    expect(fired.map((f) => f.channel)).toEqual(['soft', 'impactMedium']);
  });

  it('cancel clears the pending steps', () => {
    vi.useFakeTimers();
    const { fired, cancel } = record(HAPTIC_SEQUENCES.celebrate);
    vi.advanceTimersByTime(100);
    cancel();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(fired).toHaveLength(2);
  });
});
