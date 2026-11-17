import { create } from 'zustand';
import { deleteSecureItem, getSecureItem, setSecureItem } from '../services/storage/secureStore';

const STORAGE_KEY = 'grow.demoTutorial.v2';
const HINTS_KEY = 'grow.tabHints.v1';

/** Tabs that get a one-time hint the first time they are opened. */
export const TAB_HINT_KEYS = ['Explore', 'Journal', 'Marketplace', 'Profile'] as const;
export type TabHintKey = (typeof TAB_HINT_KEYS)[number];

export function isTabHintKey(route: string | null | undefined): route is TabHintKey {
  return !!route && (TAB_HINT_KEYS as readonly string[]).includes(route);
}

/** Tolerant parse of the persisted hint list: unknown keys and bad JSON are ignored. */
export function parseSeenHints(raw: string | null | undefined): Partial<Record<TabHintKey, true>> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return {};
    const out: Partial<Record<TabHintKey, true>> = {};
    for (const k of parsed) if (typeof k === 'string' && isTabHintKey(k)) out[k] = true;
    return out;
  } catch {
    return {};
  }
}

type DemoTutorialState = {
  hydrated: boolean;
  seen: boolean;
  forceShow: boolean;
  /** Tabs whose one-time hint has already been shown. */
  hintsSeen: Partial<Record<TabHintKey, true>>;
  /** Bumped when the tour hands off to Home's Today check-in (Feed scrolls up + pulses it). */
  checkInSpotlight: number;
  hydrate: () => Promise<void>;
  complete: () => Promise<void>;
  replay: () => void;
  /** Hint to show for this tab right now, or null (tour open, already seen, not a hint tab). */
  hintFor: (route: string | null | undefined) => TabHintKey | null;
  markHintSeen: (key: TabHintKey) => Promise<void>;
  requestCheckInSpotlight: () => void;
};

export const useDemoTutorialStore = create<DemoTutorialState>((set, get) => ({
  hydrated: false,
  seen: false,
  forceShow: false,
  hintsSeen: {},
  checkInSpotlight: 0,
  hydrate: async () => {
    if (get().hydrated) return;
    const [raw, hintsRaw] = await Promise.all([
      getSecureItem(STORAGE_KEY).catch(() => null),
      getSecureItem(HINTS_KEY).catch(() => null),
    ]);
    set({ hydrated: true, seen: raw === '1', hintsSeen: parseSeenHints(hintsRaw) });
  },
  complete: async () => {
    await setSecureItem(STORAGE_KEY, '1');
    set({ seen: true, forceShow: false });
  },
  replay: () => set({ forceShow: true }),
  hintFor: (route) => {
    const s = get();
    if (!s.hydrated || !s.seen || s.forceShow) return null;
    if (!isTabHintKey(route)) return null;
    return s.hintsSeen[route] ? null : route;
  },
  markHintSeen: async (key) => {
    if (get().hintsSeen[key]) return;
    const next = { ...get().hintsSeen, [key]: true as const };
    set({ hintsSeen: next });
    await setSecureItem(HINTS_KEY, JSON.stringify(Object.keys(next)));
  },
  requestCheckInSpotlight: () => set((s) => ({ checkInSpotlight: s.checkInSpotlight + 1 })),
}));

export async function resetDemoTutorialFlag(): Promise<void> {
  await deleteSecureItem(STORAGE_KEY);
  await deleteSecureItem(HINTS_KEY);
  useDemoTutorialStore.setState({ seen: false, forceShow: true, hydrated: true, hintsSeen: {} });
}
