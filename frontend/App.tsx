import React, { useEffect, useCallback, useRef, useState } from 'react';
import { Animated, Easing, Linking, StyleSheet, View } from 'react-native';
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';

/** Cream scene behind every screen so pushes, modals and bounces never flash grey. */
const NAV_THEME: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#F3EEE4',
    card: '#FFFCF7',
    primary: '#059669',
    border: 'rgba(231,229,228,0.9)',
  },
};
import { Provider } from 'react-redux';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { store } from './src/store/store';
import linking from './src/app/navigation/linking';
import RootNavigator from './src/app/navigation/RootNavigator';
import { useAppDispatch, useAppSelector } from './src/store/store';
import { hydrateAuth, signOut } from './src/store/slices/authSlice';
import BrandLoadingScreen from './src/components/common/BrandLoadingScreen';
import { markBootSplashDone, onBootRevealStart } from './src/components/auth/bootSplashSignal';
import { theme } from './src/lib/tw';
import { useActivationStore } from './src/state/useActivationStore';
import AppDialogHost from './src/components/ui/AppDialog';
import ToastHost from './src/components/ui/Toast';
import { KeyboardDoneAccessory } from './src/components/ui/KeyboardDoneAccessory';
import { initMonitoring } from './src/services/monitoring';
import { prewarmFirstOpenRead } from './src/utils/firstLaunch';
import {
  navigationRef,
  handleCheckoutDeepLink,
  resetToAuth,
} from './src/app/navigation/navigationRef';
import { setBadgesEarnedHandler, setSessionExpiredHandler } from './src/services/api/http';
import { useGrowthStore } from './src/state/useGrowthStore';

// Hold the native splash (brand mark on emerald) until BrandLoadingScreen has
// painted the same mark at the same rect. First thing at module scope, before
// anything else can yield to the native side; Sentry init follows immediately.
SplashScreen.preventAutoHideAsync().catch(() => undefined);
try {
  // Short native crossfade so the handoff is invisible even if a frame differs.
  SplashScreen.setOptions({ duration: 150, fade: true });
} catch {
  // Older native module without setOptions: default hide is fine.
}

initMonitoring();

// Refresh token rejected (expired, revoked, banned): clear every slice and go
// back to sign-in instead of showing a logged-in UI whose requests all fail.
// Badges earned by any write → celebration queue; streak/check-in state refreshes.
setBadgesEarnedHandler((badges) => {
  const growth = useGrowthStore.getState();
  growth.pushBadges(badges);
  void growth.refresh({ force: true });
});

setSessionExpiredHandler(() => {
  if (!store.getState().auth.token) return;
  void store.dispatch(signOut()).finally(() => resetToAuth());
});

// Start reading `grow.firstOpenSeen` now (non-blocking) so the splash can pick
// daily vs first-launch within its 100ms budget.
prewarmFirstOpenRead();

function AppContent() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const hydrated = useAppSelector((state) => state.auth.hydrated);
  const [bootDone, setBootDone] = useState(false);

  useEffect(() => {
    if (!hydrated) {
      dispatch(hydrateAuth());
    }
    void useActivationStore.getState().hydrate();
  }, [dispatch, hydrated]);

  useEffect(() => {
    const onUrl = ({ url }: { url: string }) => {
      if (url.startsWith('growl://checkout/')) {
        handleCheckoutDeepLink(url);
      }
      // growl://reset-password links just open the app; the reset code is
      // entered on the Auth screen. Never log these URLs (they carry tokens).
    };
    const sub = Linking.addEventListener('url', onUrl);
    Linking.getInitialURL().then((url) => {
      if (url) onUrl({ url });
    });
    return () => sub.remove();
  }, []);

  // Native splash goes only once the JS mark has loaded at the native rect
  // (both layers onLoadEnd + layout) — never merely on layout or on `hydrated`,
  // either of which can beat the mark's first paint and flash emerald.
  const onBootMarkPainted = useCallback(() => {
    requestAnimationFrame(() => {
      SplashScreen.hideAsync().catch(() => undefined);
    });
  }, []);

  // The app underneath settles 1.03 → 1 while the splash blooms off it.
  const navScale = useRef(new Animated.Value(1.03)).current;
  const [navSettled, setNavSettled] = useState(false);
  useEffect(
    () =>
      onBootRevealStart(({ animate }) => {
        if (!animate) {
          navScale.setValue(1);
          setNavSettled(true);
          return;
        }
        Animated.timing(navScale, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => setNavSettled(true));
      }),
    [navScale],
  );

  return (
    <View style={styles.root}>
      {hydrated ? (
        <Animated.View
          style={[styles.nav, navSettled ? null : { transform: [{ scale: navScale }] }]}
        >
          <NavigationContainer key={token || 'no-token'} ref={navigationRef} linking={linking} theme={NAV_THEME}>
            <StatusBar style="auto" />
            <RootNavigator />
          </NavigationContainer>
        </Animated.View>
      ) : (
        <View style={styles.hold} />
      )}
      {!bootDone ? (
        <View style={styles.splash} pointerEvents="auto">
          <BrandLoadingScreen
            variant="splash"
            mode="auto"
            showWordmark
            message="Still growing."
            ready={hydrated}
            // Signed out: melt the emerald field into the cream auth page.
            exitBackground={hydrated && !token ? theme.colors.page : undefined}
            onFinished={() => {
              setBootDone(true);
              markBootSplashDone();
            }}
            onMarkPainted={onBootMarkPainted}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#049669' },
  hold: { flex: 1, backgroundColor: '#049669' },
  nav: { flex: 1 },
  splash: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
  },
});

export default function App() {
  useEffect(() => {
    // Safety: if the mark never reports loaded, still drop the native splash.
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => undefined);
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <AppContent />
        {/* Success / info toasts: above navigation, below AppDialog modals */}
        <ToastHost />
        <AppDialogHost />
        {/* Shared iOS Done bar for FormTextInput / formInputAccessoryProps fields */}
        <KeyboardDoneAccessory />
      </SafeAreaProvider>
    </Provider>
  );
}
