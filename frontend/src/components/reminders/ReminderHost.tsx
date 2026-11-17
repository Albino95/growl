import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../store/hooks';
import { useGrowthStore } from '../../state/useGrowthStore';
import { useReminderStore, whenRemindersHydrated } from '../../state/useReminderStore';
import { toast } from '../../state/useToastStore';
import { haptic } from '../../theme/haptics';
import { isBadgeCelebrationOpen } from '../badges/BadgeCelebrationHost';
import {
  IGNORE_LIMIT,
  createCheckinSaveTracker,
  defaultReminderTime,
  formatReminderTime,
  shouldOfferReminder,
} from '../../services/reminderPlan';
import {
  disableDailyReminder,
  enableDailyReminder,
  getReminderPermission,
  setRemindersActive,
} from '../../services/reminders';
import ReminderAskSheet from './ReminderAskSheet';
import ReminderQuietSheet from './ReminderQuietSheet';

/** Wait for a badge celebration to finish before presenting another modal. */
const ASK_DELAY_MS = 1200;
const POLL_MS = 500;
const MAX_WAIT_MS = 3 * 60 * 1000;
/** Let launch-time modals (badges from the server) settle before the pause notice. */
const QUIET_DELAY_MS = 4000;

let askedThisSession = false;

function waitForQuietScreen(minDelayMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const busy = isBadgeCelebrationOpen() || useGrowthStore.getState().pendingBadges.length > 0;
      if (!busy && Date.now() - start >= minDelayMs) return resolve(true);
      if (Date.now() - start > MAX_WAIT_MS) return resolve(false);
      setTimeout(tick, POLL_MS);
    };
    setTimeout(tick, Math.min(minDelayMs, POLL_MS));
  });
}

/**
 * Global host for the daily reminder UI (mount once, next to ToastHost):
 *   - the soft ask after the first successful check-in;
 *   - the "Still want a daily nudge?" card after reminders were auto-paused;
 *   - pauses all scheduling while signed out.
 */
export default function ReminderHost() {
  const { token, hydrated } = useAuth();
  const signedIn = !!token;
  const mounted = useRef(true);
  const [ask, setAsk] = useState<{ hour: number; minute: number } | null>(null);
  const [quietVisible, setQuietVisible] = useState(false);
  const [quietDismissed, setQuietDismissed] = useState(false);
  const enabled = useReminderStore((s) => s.enabled);
  const paused = useReminderStore((s) => s.ignoredCount >= IGNORE_LIMIT);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (hydrated) setRemindersActive(signedIn);
  }, [hydrated, signedIn]);

  // Soft ask after a check-in is saved (gated: cooldown, max asks, OS state).
  useEffect(() => {
    if (!signedIn) return;
    const tracker = createCheckinSaveTracker();
    tracker.observe(useGrowthStore.getState());
    const unsub = useGrowthStore.subscribe((s) => {
      if (!tracker.observe(s)) return;
      const checkedInAt = new Date();
      void (async () => {
        await whenRemindersHydrated();
        const prefs = useReminderStore.getState();
        const permission = await getReminderPermission();
        const gate = {
          now: Date.now(),
          enabled: prefs.enabled,
          lastAskedAt: prefs.lastAskedAt,
          askCount: prefs.askCount,
          permission,
          shownThisSession: askedThisSession,
        };
        if (!shouldOfferReminder(gate)) return;
        askedThisSession = true;
        const ok = await waitForQuietScreen(ASK_DELAY_MS);
        if (!ok || !mounted.current || useReminderStore.getState().enabled) return;
        useReminderStore.getState().markAsked();
        setAsk(defaultReminderTime(checkedInAt));
      })();
    });
    return unsub;
  }, [signedIn]);

  // Auto-quiet: reminders paused after several unanswered → ask once this session.
  useEffect(() => {
    if (!signedIn || !enabled || !paused || quietDismissed || ask) return;
    let cancelled = false;
    void waitForQuietScreen(QUIET_DELAY_MS).then((ok) => {
      if (ok && !cancelled && mounted.current) setQuietVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn, enabled, paused, quietDismissed, ask]);

  const onAllow = (hour: number, minute: number) => {
    setAsk(null);
    // The sheet has slid away; give the Modal a beat to unmount before the system prompt.
    setTimeout(() => {
      void enableDailyReminder(hour, minute).then((perm) => {
        if (perm.granted) {
          haptic('success');
          toast.success(`Daily nudge set for ${formatReminderTime(hour, minute)}`, {
            icon: 'notifications-outline',
          });
        } else {
          toast.info('Notifications are off. You can turn them on in Settings.', {
            icon: 'notifications-off-outline',
          });
        }
      });
    }, 150);
  };

  const closeQuiet = () => {
    setQuietVisible(false);
    setQuietDismissed(true);
  };

  if (!signedIn) return null;

  return (
    <>
      <ReminderAskSheet
        visible={!!ask}
        hour={ask?.hour ?? 20}
        minute={ask?.minute ?? 0}
        onAllow={onAllow}
        onNotNow={() => setAsk(null)}
      />
      <ReminderQuietSheet
        visible={quietVisible}
        onKeep={() => {
          useReminderStore.getState().resetIgnored();
          toast.success('Okay, we’ll keep nudging gently');
        }}
        onTurnOff={() => {
          disableDailyReminder();
          toast.info('Daily reminder off');
        }}
        onDismiss={closeQuiet}
      />
    </>
  );
}
