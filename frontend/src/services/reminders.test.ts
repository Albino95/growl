import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';

const scheduled = new Map<
  string,
  { identifier: string; content: { data: unknown }; trigger: unknown }
>();
let permission = { granted: true, status: 'granted', canAskAgain: true };

vi.mock('expo-notifications', () => ({
  IosAuthorizationStatus: { PROVISIONAL: 3, EPHEMERAL: 4 },
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: vi.fn(async () => permission),
  requestPermissionsAsync: vi.fn(async () => permission),
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => null),
  getAllScheduledNotificationsAsync: vi.fn(async () => [...scheduled.values()]),
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
    scheduled.delete(id);
  }),
  scheduleNotificationAsync: vi.fn(
    async (req: { identifier: string; content: { data: unknown }; trigger: unknown }) => {
      scheduled.set(req.identifier, req);
      return req.identifier;
    },
  ),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  getLastNotificationResponseAsync: vi.fn(async () => null),
  clearLastNotificationResponseAsync: vi.fn(async () => undefined),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (s: { ios?: unknown }) => s.ios },
  AppState: { currentState: 'active', addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));

vi.mock('@react-navigation/native', () => ({ CommonActions: { navigate: vi.fn() } }));
vi.mock('../app/navigation/navigationRef', () => ({
  navigationRef: { isReady: () => false, getRootState: () => null, dispatch: vi.fn() },
}));

vi.mock('./storage/secureStore', () => ({
  getSecureItem: vi.fn(async () => null),
  setSecureItem: vi.fn(async () => undefined),
  deleteSecureItem: vi.fn(async () => undefined),
}));

type G = {
  checkin: { day: string } | null;
  day: string | null;
  lifeMode: { mode: string; until: string | null } | null;
  refresh: () => Promise<void>;
};
const growth = create<G>(() => ({
  checkin: null,
  day: null,
  lifeMode: null,
  refresh: async () => undefined,
}));
vi.mock('../state/useGrowthStore', () => ({ useGrowthStore: growth }));
vi.mock('../state/useDemoTutorialStore', () => ({
  useDemoTutorialStore: { getState: () => ({ requestCheckInSpotlight: vi.fn() }) },
}));

const { replanReminders } = await import('./reminders');
const { useReminderStore } = await import('../state/useReminderStore');

// Sat 14 Nov 2026, 10:15 local.
const NOW = new Date(2026, 10, 14, 10, 15);
const ids = () => [...scheduled.keys()].sort();

describe('replanReminders', () => {
  beforeEach(() => {
    scheduled.clear();
    permission = { granted: true, status: 'granted', canAskAgain: true };
    growth.setState({ checkin: null, day: null, lifeMode: null });
    useReminderStore.setState({
      enabled: true,
      hour: 20,
      minute: 0,
      ignoredCount: 0,
      scheduled: [],
      checkinDays: [],
    });
  });

  it('schedules 7 single-date reminders without sound', async () => {
    await replanReminders(NOW);
    expect(ids()).toEqual([
      'grow-checkin-2026-11-14',
      'grow-checkin-2026-11-15',
      'grow-checkin-2026-11-16',
      'grow-checkin-2026-11-17',
      'grow-checkin-2026-11-18',
      'grow-checkin-2026-11-19',
      'grow-checkin-2026-11-20',
    ]);
    const first = scheduled.get('grow-checkin-2026-11-14') as unknown as {
      content: { sound: boolean; data: { kind: string } };
      trigger: { type: string; date: Date };
    };
    expect(first.content.sound).toBe(false);
    expect(first.content.data.kind).toBe('daily-checkin');
    expect(first.trigger.type).toBe('date');
    expect(first.trigger.date.getHours()).toBe(20);
  });

  it('checking in today cancels just today', async () => {
    await replanReminders(NOW);
    growth.setState({ checkin: { day: '2026-11-14' }, day: '2026-11-14' });
    await replanReminders(NOW);
    expect(ids()).not.toContain('grow-checkin-2026-11-14');
    expect(ids()).toHaveLength(6);
    expect(useReminderStore.getState().checkinDays).toContain('2026-11-14');
  });

  it('turning off or losing permission clears everything', async () => {
    await replanReminders(NOW);
    permission = { granted: false, status: 'denied', canAskAgain: false };
    await replanReminders(NOW);
    expect(ids()).toEqual([]);

    permission = { granted: true, status: 'granted', canAskAgain: true };
    await replanReminders(NOW);
    useReminderStore.getState().setEnabled(false);
    await replanReminders(NOW);
    expect(ids()).toEqual([]);
  });

  it('pauses after 3 unanswered reminders in a row', async () => {
    useReminderStore.setState({
      ignoredCount: 1,
      scheduled: [
        { day: '2026-11-12', at: new Date(2026, 10, 12, 20).getTime() },
        { day: '2026-11-13', at: new Date(2026, 10, 13, 20).getTime() },
      ],
    });
    await replanReminders(NOW);
    expect(useReminderStore.getState().ignoredCount).toBe(3);
    expect(ids()).toEqual([]);

    useReminderStore.getState().resetIgnored();
    await replanReminders(NOW);
    expect(ids()).toHaveLength(7);
  });
});
