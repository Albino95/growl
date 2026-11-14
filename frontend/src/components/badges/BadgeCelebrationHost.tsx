import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '../../store/hooks';
import { useGrowthStore } from '../../state/useGrowthStore';
import { getMyBadges, type BadgeEarned } from '../../services/api/growth';
import ShareCardSheet, { type ShareCardPayload } from '../share/ShareCardSheet';
import BadgeCelebrationModal from './BadgeCelebrationModal';
import { badgeSharePayload } from './shareAdapters';

const CHECK_EVERY_MS = 10 * 60 * 1000;

/** Module-level so remounts (e.g. navigator re-renders) don't re-celebrate or re-poll. */
let lastCheckAt = 0;
let lastCheckUser: string | null = null;
const celebrated = new Set<string>();
/** True while a badge celebration or its share sheet is on screen (other hosts wait for it). */
let celebrationOpen = false;

/** Lets other global sheets (e.g. the reminder ask) avoid stacking a second modal on top. */
export function isBadgeCelebrationOpen(): boolean {
  return celebrationOpen;
}

/**
 * Global badge celebrations. Mount once inside the app root (no props).
 * - Consumes `pendingBadges` from useGrowthStore (create responses' `new_badges`).
 * - On launch / foreground (at most every 10 min) asks GET /me/badges for unseen
 *   earned badges and celebrates those too. Failures are silent.
 */
export default function BadgeCelebrationHost() {
  const { user, token } = useAuth();
  const userId = user?.id ?? null;
  const signedIn = !!(userId && token);

  const [queue, setQueue] = useState<BadgeEarned[]>([]);
  const [sharePayload, setSharePayload] = useState<ShareCardPayload | null>(null);
  const pendingCount = useGrowthStore((s) => s.pendingBadges.length);

  const enqueue = useCallback((items: BadgeEarned[]) => {
    const fresh = items.filter((b) => b?.id && !celebrated.has(b.id));
    if (!fresh.length) return;
    fresh.forEach((b) => celebrated.add(b.id));
    setQueue((q) => [...q, ...fresh]);
  }, []);

  // 1) Fresh badges pushed by create flows.
  useEffect(() => {
    if (!signedIn || pendingCount === 0) return;
    enqueue(useGrowthStore.getState().takeBadges());
  }, [signedIn, pendingCount, enqueue]);

  // 2) Unseen badges from the server (throttled, foreground).
  const checkServer = useCallback(
    async (force = false) => {
      if (!signedIn || !userId) return;
      if (lastCheckUser !== userId) {
        lastCheckUser = userId;
        lastCheckAt = 0;
        celebrated.clear();
      }
      if (!force && Date.now() - lastCheckAt < CHECK_EVERY_MS) return;
      lastCheckAt = Date.now();
      try {
        const res = await getMyBadges();
        if (!res || !Array.isArray(res.earned)) return;
        const byId = new Map((res.catalog || []).map((c) => [c.id, c]));
        const unseen = res.earned.filter((e) => e && e.seen === false && !celebrated.has(e.id));
        if (!unseen.length) return;
        enqueue(
          unseen.map((e) => {
            const c = byId.get(e.id);
            return {
              id: e.id,
              name: c?.name ?? 'a new badge',
              description: c?.description ?? '',
              points: c?.points ?? 0,
            };
          })
        );
      } catch {
        // Endpoint may not be deployed yet / offline — try again next window.
      }
    },
    [signedIn, userId, enqueue]
  );

  useEffect(() => {
    if (!signedIn) {
      setQueue([]);
      return;
    }
    // Small delay so first paint / boot requests win.
    const t = setTimeout(() => void checkServer(), 2500);
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void checkServer();
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [signedIn, checkServer]);

  const current = sharePayload ? null : queue[0] ?? null;

  useEffect(() => {
    celebrationOpen = signedIn && (queue.length > 0 || !!sharePayload);
    return () => {
      celebrationOpen = false;
    };
  }, [signedIn, queue.length, sharePayload]);

  const advance = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  if (!signedIn) return null;

  return (
    <>
      <BadgeCelebrationModal
        badge={current}
        remaining={Math.max(0, queue.length - 1)}
        onNext={advance}
        onShare={(b) => {
          setSharePayload(
            badgeSharePayload({
              badgeId: b.id,
              name: b.name,
              description: b.description,
              points: b.points,
              username: user?.username || 'me',
              userId: user?.id,
              avatar: user?.avatar ?? null,
            })
          );
        }}
      />
      <ShareCardSheet
        visible={!!sharePayload}
        payload={sharePayload}
        onClose={() => {
          setSharePayload(null);
          advance();
        }}
      />
    </>
  );
}

