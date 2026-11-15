import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
vi.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

import { IDLE_AFTER_MS, nextPollDelay, POLL_ACTIVE_MS, POLL_IDLE_MS } from './polling';

describe('nextPollDelay', () => {
  it('polls fast while active and backs off after 2 minutes idle', () => {
    const now = 1_000_000;
    expect(nextPollDelay(now, now)).toBe(POLL_ACTIVE_MS);
    expect(nextPollDelay(now - IDLE_AFTER_MS + 1, now)).toBe(POLL_ACTIVE_MS);
    expect(nextPollDelay(now - IDLE_AFTER_MS, now)).toBe(POLL_IDLE_MS);
    expect(POLL_IDLE_MS).toBe(20_000);
  });
});
