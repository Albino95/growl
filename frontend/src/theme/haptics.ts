import { triggerFeedback, type FeedbackKind } from '../utils/interactionFeedback';
import { getSecureItem, setSecureItem } from '../services/storage/secureStore';
import { createOnceRegistry } from './hapticsCore';

export { HAPTIC_DEBOUNCE_MS, CELEBRATE_SIGNATURE } from './hapticsCore';
export { whenFeedbackReady } from '../utils/interactionFeedback';

/**
 * Grow! haptic vocabulary. Pick the *moment*, not the motor:
 *
 * - `selection`    tab, chip, segment, switch, picker, scrub tick
 * - `tapLight`     state-changing taps: like on, follow, join, send, sheet open, refresh threshold
 * - `impactMedium` record start, long-press tray, drag past a threshold
 * - `success`      check-in saved, shared, signed in, request accepted   (+ sound)
 * - `warning`      destructive confirm
 * - `error`        failed action                                         (+ sound)
 * - `celebrate`    milestones — success, rigid +140ms, soft +280ms       (+ sound)
 *                  prefer `celebrateOnce(id)` so a milestone fires once ever
 *
 * Rules: fire on `onPress` (never on press-in or scroll), plain navigation taps
 * are silent, repeats are debounced per group (selection 50ms, light 120ms,
 * success/warning/error 800ms, celebrate 4s). Respects Settings prefs.
 */
export type HapticMoment =
  | 'selection'
  | 'tapLight'
  | 'impactMedium'
  | 'success'
  | 'warning'
  | 'error'
  | 'celebrate';

export const HAPTIC_MOMENT_KIND: Record<HapticMoment, FeedbackKind> = {
  selection: 'selection',
  tapLight: 'impactLight',
  impactMedium: 'impactMedium',
  success: 'success',
  warning: 'warn',
  error: 'error',
  celebrate: 'celebrate',
};

/** Fire the haptic (and, for success/error/celebrate, the UI sound) for a moment. */
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
