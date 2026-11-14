import { Platform } from 'react-native';
import { copyToClipboard } from '../../utils/csvDownload';

/**
 * Copy text without new installs: RN core Clipboard on native (deprecated but
 * still shipped in RN 0.81), the existing web helper otherwise.
 * Returns true when the text is on the clipboard (caller shows "Copied").
 */
export async function copyText(text: string): Promise<boolean> {
  if (Platform.OS !== 'web') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Clipboard } = require('react-native') as {
        Clipboard?: { setString: (s: string) => void };
      };
      if (Clipboard?.setString) {
        Clipboard.setString(text);
        return true;
      }
    } catch {
      // fall through
    }
  }
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through
    }
  }
  // Last resort shows the text in a dialog so it can be copied by hand.
  await copyToClipboard(text, 'Your invite');
  return false;
}

/** Friendly, warm copy for invite redeem / lookup failures. */
export function friendlyInviteError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  const msg = raw.toLowerCase();
  if (msg.includes('own')) return 'That’s your own code — share it with a friend instead 🌱';
  if (msg.includes('already')) return 'You’ve already used an invite code. You can still add friends from their profile.';
  if (msg.includes('14') || msg.includes('too late') || msg.includes('too old') || msg.includes('new accounts'))
    return 'Invite codes work during your first 14 days on Grow! — you can still add friends from their profile.';
  if (msg.includes('block')) return 'This invite can’t be used.';
  if (msg.includes('not found') || msg.includes('invalid') || msg.includes('expired') || msg.includes('404'))
    return 'We couldn’t find that code. Double-check it and try again.';
  if (msg.includes('rate') || msg.includes('too many')) return 'Too many tries — take a breath and try again in a minute.';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('offline'))
    return 'You seem to be offline. Try again when you’re connected.';
  return raw || 'That code didn’t work. Please try again.';
}
