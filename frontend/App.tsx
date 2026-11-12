import React, { useEffect, useCallback, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { Provider } from 'react-redux';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { store } from './src/store/store';
import RootNavigator from './src/app/navigation/RootNavigator';
import { useAppDispatch, useAppSelector } from './src/store/store';
import { hydrateAuth, signOut } from './src/store/slices/authSlice';
import BrandLoadingScreen from './src/components/common/BrandLoadingScreen';
import { markBootSplashDone } from './src/components/auth/bootSplashSignal';
import { theme } from './src/lib/tw';
import { useActivationStore } from './src/state/useActivationStore';
import AppDialogHost from './src/components/ui/AppDialog';
import { KeyboardDoneAccessory } from './src/components/ui/KeyboardDoneAccessory';
import { initMonitoring } from './src/services/monitoring';
import {
  navigationRef,
  handleCheckoutDeepLink,
  resetToAuth,
} from './src/app/navigation/navigationRef';
import { setSessionExpiredHandler } from './src/services/api/http';

initMonitoring();

// Refresh token rejected (expired, revoked, banned): clear every slice and go
// back to sign-in instead of showing a logged-in UI whose requests all fail.
setSessionExpiredHandler(() => {
  if (!store.getState().auth.token) return;
  void store.dispatch(signOut()).finally(() => resetToAuth());
});

// Keep native splash (solid emerald) up until BrandLoadingScreen is painted.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

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

  const onLoaderLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (hydrated) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [hydrated]);

  return (
    <View style={styles.root}>
      {hydrated ? (
        <NavigationContainer key={token || 'no-token'} ref={navigationRef}>
          <StatusBar style="auto" />
          <RootNavigator />
        </NavigationContainer>
      ) : (
        <View style={styles.hold} />
      )}
      {!bootDone ? (
        <View style={styles.splash} pointerEvents="auto">
          <BrandLoadingScreen
            variant="splash"
            showWordmark
            message="Still growing."
            ready={hydrated}
            // Signed out: melt the emerald field into the cream auth page.
            exitBackground={hydrated && !token ? theme.colors.page : undefined}
            onFinished={() => {
              setBootDone(true);
              markBootSplashDone();
            }}
            onLayout={onLoaderLayout}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#049669' },
  hold: { flex: 1, backgroundColor: '#049669' },
  splash: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
  },
});

export default function App() {
  useEffect(() => {
    // Safety: if JS hangs, still drop the native emerald splash.
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => undefined);
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <AppContent />
        <AppDialogHost />
        {/* Shared iOS Done bar for FormTextInput / formInputAccessoryProps fields */}
        <KeyboardDoneAccessory />
      </SafeAreaProvider>
    </Provider>
  );
}
