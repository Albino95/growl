import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('../services/storage/secureStore', () => ({
  getSecureItem: vi.fn(async (k: string) => mem.get(k) ?? null),
  setSecureItem: vi.fn(async (k: string, v: string) => {
    mem.set(k, v);
    return true;
  }),
  deleteSecureItem: vi.fn(async (k: string) => {
    mem.delete(k);
  }),
}));

const { useDemoTutorialStore, parseSeenHints, resetDemoTutorialFlag } = await import(
  './useDemoTutorialStore'
);

function fresh() {
  useDemoTutorialStore.setState({
    hydrated: false,
    seen: false,
    forceShow: false,
    hintsSeen: {},
    checkInSpotlight: 0,
  });
}

describe('parseSeenHints', () => {
  it('ignores bad JSON and unknown keys', () => {
    expect(parseSeenHints(null)).toEqual({});
    expect(parseSeenHints('{nope')).toEqual({});
    expect(parseSeenHints('{"Journal":true}')).toEqual({});
    expect(parseSeenHints('["Journal","Feed",3,"Profile"]')).toEqual({ Journal: true, Profile: true });
  });
});

describe('tab hints', () => {
  beforeEach(() => {
    mem.clear();
    fresh();
  });

  it('shows nothing until hydrated and the tour is done', async () => {
    const s = useDemoTutorialStore.getState();
    expect(s.hintFor('Journal')).toBeNull();
    await s.hydrate();
    // Tour not seen yet — the tour owns the screen.
    expect(useDemoTutorialStore.getState().hintFor('Journal')).toBeNull();
    await useDemoTutorialStore.getState().complete();
    expect(useDemoTutorialStore.getState().hintFor('Journal')).toBe('Journal');
  });

  it('never hints Home or unknown routes', async () => {
    mem.set('grow.demoTutorial.v2', '1');
    await useDemoTutorialStore.getState().hydrate();
    expect(useDemoTutorialStore.getState().hintFor('Feed')).toBeNull();
    expect(useDemoTutorialStore.getState().hintFor('Instructor')).toBeNull();
    expect(useDemoTutorialStore.getState().hintFor(undefined)).toBeNull();
  });

  it('persists a seen hint per tab across launches', async () => {
    mem.set('grow.demoTutorial.v2', '1');
    await useDemoTutorialStore.getState().hydrate();
    await useDemoTutorialStore.getState().markHintSeen('Journal');
    expect(useDemoTutorialStore.getState().hintFor('Journal')).toBeNull();
    expect(useDemoTutorialStore.getState().hintFor('Explore')).toBe('Explore');

    fresh();
    await useDemoTutorialStore.getState().hydrate();
    expect(useDemoTutorialStore.getState().hintFor('Journal')).toBeNull();
    expect(useDemoTutorialStore.getState().hintFor('Marketplace')).toBe('Marketplace');
  });

  it('hides hints while a replayed tour is open', async () => {
    mem.set('grow.demoTutorial.v2', '1');
    await useDemoTutorialStore.getState().hydrate();
    useDemoTutorialStore.getState().replay();
    expect(useDemoTutorialStore.getState().hintFor('Profile')).toBeNull();
    await useDemoTutorialStore.getState().complete();
    expect(useDemoTutorialStore.getState().hintFor('Profile')).toBe('Profile');
  });

  it('reset clears hints too', async () => {
    mem.set('grow.demoTutorial.v2', '1');
    await useDemoTutorialStore.getState().hydrate();
    await useDemoTutorialStore.getState().markHintSeen('Explore');
    await resetDemoTutorialFlag();
    expect(mem.has('grow.tabHints.v1')).toBe(false);
    expect(useDemoTutorialStore.getState().hintsSeen).toEqual({});
  });

  it('bumps the check-in spotlight counter', () => {
    useDemoTutorialStore.getState().requestCheckInSpotlight();
    useDemoTutorialStore.getState().requestCheckInSpotlight();
    expect(useDemoTutorialStore.getState().checkInSpotlight).toBe(2);
  });
});
