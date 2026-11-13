import React, { useEffect, useCallback, useRef, useState } from 'react';
import { Animated, Easing, Linking, StyleSheet, View } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type NavigationState,
  type Theme,
} from '@react-navigation/native';
import { THEME_COLORS, type ColorSchemeName } from './src/theme/palette';
import { useAppearanceSync } from './src/theme/appearance';

/**
 * Page colour behind every screen so pushes, modals and bounces never flash
 * grey (cream in light, night-soil in dark). Built once per scheme.
 */
const NAV_THEMES: Record<ColorSchemeName, Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: THEME_COLORS.light.page,
      card: THEME_COLORS.light.card,
      text: THEME_COLORS.light.ink,
      primary: '#059669',
      border: 'rgba(231,229,228,0.9)',
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: THEME_COLORS.dark.page,
      card: THEME_COLORS.dark.card,
      text: THEME_COLORS.dark.ink,
      primary: THEME_COLORS.dark.leafInk,
      border: THEME_COLORS.dark.line,
      notification: THEME_COLORS.dark.energy,
    },
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

function AppContent({ scheme }: { scheme: ColorSchemeName }) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const hydrated = useAppSelector((state) => state.auth.hydrated);
  const [bootDone, setBootDone] = useState(false);

  // The navigation tree is keyed on the colour scheme so a switch remounts it
  // and every tw`...` call re-runs against the new instance. Capture the nav
  // state so the remount lands on the same screen (scheme switches only — a
  // token change still starts fresh, as before).
  const navKey = token || 'no-token';
  const savedNav = useRef<{ key: string; state: NavigationState | undefined }>({
    key: navKey,
    state: undefined,
  });
  if (savedNav.current.key !== navKey) savedNav.current = { key: navKey, state: undefined };
  const onNavStateChange = useCallback(
    (state: NavigationState | undefined) => {
      if (savedNav.current.key === navKey) savedNav.current.state = state;
    },
    [navKey],
  );

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
          <NavigationContainer
            key={`${navKey}:${scheme}`}
            ref={navigationRef}
            linking={linking}
            theme={NAV_THEMES[scheme]}
            // Only set after a scheme remount; first mount still honours the
            // linking initial URL (initialState would suppress it).
            initialState={savedNav.current.state}
            onStateChange={onNavStateChange}
          >
            {/* Dark icons on cream, light icons on night soil. */}
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
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
  // Resolves appearance pref + OS scheme and switches tw / theme.colors.
  const scheme = useAppearanceSync();

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
        <AppContent scheme={scheme} />
        {/* Success / info toasts: above navigation, below AppDialog modals.
            Keyed on scheme so their tw styles re-evaluate on a switch. */}
        <ToastHost key={`toast:${scheme}`} />
        <AppDialogHost key={`dialog:${scheme}`} />
        {/* Shared iOS Done bar for FormTextInput / formInputAccessoryProps fields */}
        <KeyboardDoneAccessory />
      </SafeAreaProvider>
    </Provider>
  );
}
