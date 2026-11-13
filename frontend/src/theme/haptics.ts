import { triggerFeedback } from '../utils/interactionFeedback';
import { getSecureItem, setSecureItem } from '../services/storage/secureStore';
import { createOnceRegistry, HAPTIC_MOMENT_KIND, type HapticMoment } from './hapticsCore';

export { HAPTIC_DEBOUNCE_MS, CELEBRATE_SIGNATURE, HAPTIC_MOMENT_KIND } from './hapticsCore';
export type { HapticMoment } from './hapticsCore';
export { whenFeedbackReady } from '../utils/interactionFeedback';

/**
 * Grow! haptic vocabulary. Pick the *moment*, not the motor:
 *
 * - `selection`    tab, chip, segment, switch, picker, scrub tick, sheet dismiss
 * - `tapLight`     state-changing taps: like on, follow, join, sheet open, refresh threshold
 * - `impactMedium` record start, long-press tray, drag past a threshold
 * - `success`      signed in, saved, request accepted — haptic only (calm, no sound)
 * - `checkin`      daily / seed check-in done                     (+ bloom)
 * - `shared`       post / reel / story published                  (+ seedpop)
 * - `send`         message / comment sent                         (+ send tick)
 * - `warning`      destructive confirm
 * - `error`        failed action                                  (+ soft-error)
 * - `celebrate`    milestones — success, rigid +140ms, soft +280ms (+ rise)
 *                  prefer `celebrateOnce(id)` so a milestone fires once ever
 *
 * Rules: fire on `onPress` (never on press-in or scroll), plain navigation taps
 * are silent, repeats are debounced per group (selection 50ms, light 120ms,
 * success/error 800ms, warning 800ms (own group), celebrate 4s). Respects
 * Settings prefs; sounds follow the iOS silent switch.
 */
/** Fire the haptic (and, for signature moments, the UI sound) for a moment. */
export function haptic(moment: HapticMoment, opts: { sound?: boolean } = {}): void {
  triggerFeedback(HAPTIC_MOMENT_KIND[moment], opts);
}

const celebrated = createOnceRegistry(
  { getItem: getSecureItem, setItem: setSecureItem },
  'grow.celebrated.v1'
);

/**
 * Celebrate a milestone exactly once ever on this device (ids persist in
 * SecureStore). Resolves true when it celebrated now — use that to decide
 * whether to show the confetti/badge animation too.
 *
 *   if (await celebrateOnce(`streak-${days}`)) showBurst();
 */
export async function celebrateOnce(eventId: string): Promise<boolean> {
  const fresh = await celebrated.claim(eventId);
  if (fresh) haptic('celebrate');
  return fresh;
}

/** True when `eventId` has already been celebrated. */
export function hasCelebrated(eventId: string): Promise<boolean> {
  return celebrated.has(eventId);
}
