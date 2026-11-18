/**
 * Partner tracked links shared by coaches (growl://p/<code>, https://letsgrow.lu/p/<code>).
 *
 * Wired in src/app/navigation/linking.ts next to the widget links: waits for auth +
 * a ready navigator (same as widgetLinks), resolves the code (which also counts the
 * click), then opens the product — or the shop's page when the link has no product.
 * Signed out → no-op (the code is resolved once they open the link again signed in).
 */
import { CommonActions } from '@react-navigation/native';
import { navigationRef } from '../app/navigation/navigationRef';
import { toast } from '../state/useToastStore';
import { resolvePartnerLink } from './api/bizInsights';
import { parsePartnerLinkUrl } from './partnerLinkUrl';
import { waitForSignedInApp } from './widgetLinks';

let inflight: string | null = null;

async function run(code: string): Promise<void> {
  if (inflight === code) return;
  inflight = code;
  try {
    const ready = await waitForSignedInApp();
    if (!ready) return;
    const link = await resolvePartnerLink(code);
    if (!link) {
      toast.info('This link isn’t active anymore.');
      return;
    }
    if (!navigationRef.isReady()) return;
    const names = navigationRef.getRootState()?.routeNames ?? [];
    if (link.product_id && names.includes('ProductDetail')) {
      navigationRef.dispatch(
        CommonActions.navigate({
          name: 'ProductDetail',
          params: { productId: link.product_id, source: 'instructor' },
        })
      );
    } else if (names.includes('Storefront')) {
      navigationRef.dispatch(
        CommonActions.navigate({
          name: 'Storefront',
          params: { businessId: link.business_id, source: 'instructor' },
        })
      );
    }
  } catch {
    toast.info('Couldn’t open this link just now. Try again in a moment.');
  } finally {
    inflight = null;
  }
}

/** Returns true when `url` is a partner link (handled asynchronously), false otherwise. */
export function handlePartnerUrl(url: string | null | undefined): boolean {
  const code = parsePartnerLinkUrl(url);
  if (!code) return false;
  void run(code);
  return true;
}
