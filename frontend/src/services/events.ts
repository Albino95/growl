/**
 * Batched, fire-and-forget client event logger for business insights
 * (backend: POST /events, routes/wave3/bizinsights.ts).
 *
 * Events queue in memory and flush every 10 s, when 20 are waiting, or when the app
 * goes to the background. Failures are dropped silently (insights are best-effort);
 * a 404 means the server has no insights yet, so logging switches itself off for the
 * rest of the session. The server dedupes views, so callers may log on every open.
 */
import { AppState } from 'react-native';
import { request, ApiError } from './api/http';

export type InsightEventType = 'product_view' | 'storefront_view' | 'link_tap';
export type InsightSource =
  | 'feed'
  | 'search'
  | 'explore'
  | 'storefront'
  | 'shop'
  | 'instructor'
  | 'link'
  | 'other';

export type InsightEvent = {
  type: InsightEventType;
  product_id?: string;
  business_id?: string;
  source?: InsightSource;
  at?: string;
};

export const FLUSH_INTERVAL_MS = 10_000;
export const FLUSH_AT = 20;
/** Server accepts ≤ 50 per request; never hold more than this in memory. */
export const MAX_BATCH = 50;
const MAX_QUEUE = 200;

type Sender = (events: InsightEvent[]) => Promise<void>;

async function defaultSend(events: InsightEvent[]): Promise<void> {
  await request('/events', { method: 'POST', body: JSON.stringify({ events }), timeoutMs: 8_000 });
}

/** Factory (exported for tests). The app uses the shared `logEvent` / `flushEvents` below. */
export function createEventLogger(send: Sender = defaultSend) {
  let queue: InsightEvent[] = [];
  let disabled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing: Promise<void> | null = null;

  const schedule = () => {
    if (timer || disabled) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, FLUSH_INTERVAL_MS);
  };

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (disabled || !queue.length) return;
    if (flushing) return flushing;
    const batch = queue.slice(0, MAX_BATCH);
    queue = queue.slice(MAX_BATCH);
    flushing = (async () => {
      try {
        await send(batch);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          disabled = true;
          queue = [];
        }
        // Anything else: dropped. Insights are best-effort and must never bother the user.
      } finally {
        flushing = null;
        if (queue.length && !disabled) schedule();
      }
    })();
    return flushing;
  }

  function log(event: InsightEvent): void {
    if (disabled) return;
    if (!event.product_id && !event.business_id) return;
    queue.push({ ...event, at: event.at ?? new Date().toISOString() });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    if (queue.length >= FLUSH_AT) void flush();
    else schedule();
  }

  return {
    log,
    flush,
    get size() {
      return queue.length;
    },
    get disabled() {
      return disabled;
    },
  };
}

const shared = createEventLogger();

// Flush when the app leaves the foreground so the last views aren't lost.
try {
  AppState?.addEventListener?.('change', (next) => {
    if (next === 'background' || next === 'inactive') void shared.flush();
  });
} catch {
  /* not available (tests / web SSR) */
}

/** Fire-and-forget. Safe to call from render effects; never throws. */
export function logEvent(event: InsightEvent): void {
  try {
    shared.log(event);
  } catch {
    /* never break a screen */
  }
}

export function flushEvents(): Promise<void> {
  return shared.flush();
}
