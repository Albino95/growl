import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';
import type { RootStackParamList } from './RootNavigator';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateRoot<Name extends keyof RootStackParamList>(
  name: Name,
  params?: RootStackParamList[Name]
) {
  if (navigationRef.isReady()) {
    // @ts-expect-error — RN generic navigate overload
    navigationRef.navigate(name, params);
  }
}

export function handleCheckoutDeepLink(url: string) {
  try {
    const parsed = new URL(url.replace(/^growl:\/\//, 'https://growl.app/'));
    const path = parsed.hostname + parsed.pathname; // checkout/success or checkout/cancel
    const orderId = parsed.searchParams.get('order_id') || undefined;
    const sessionId = parsed.searchParams.get('session_id') || undefined;
    const cancelled = path.includes('checkout/cancel');
    if (path.includes('checkout/success') || cancelled) {
      navigateRoot('OrderConfirmation', {
        orderId,
        sessionId,
        cancelled,
      });
      return true;
    }
  } catch (e) {
    console.warn('[deep-link] parse failed', url, e);
  }
  return false;
}

export function resetToAuth() {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: 'Auth' }],
    })
  );
}
