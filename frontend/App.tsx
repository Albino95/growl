import React, { useEffect, useCallback } from 'react';
import { Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { Provider } from 'react-redux';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { store } from './src/store/store';
import RootNavigator from './src/app/navigation/RootNavigator';
import { useAppDispatch, useAppSelector } from './src/store/store';
import { hydrateAuth } from './src/store/slices/authSlice';
import BrandLoadingScreen from './src/components/common/BrandLoadingScreen';
import AppDialogHost from './src/components/ui/AppDialog';
import { KeyboardDoneAccessory } from './src/components/ui/KeyboardDoneAccessory';
import { initMonitoring } from './src/services/monitoring';
import {
  navigationRef,
  handleCheckoutDeepLink,
} from './src/app/navigation/navigationRef';

initMonitoring();

// Keep native splash (solid emerald) up until BrandLoadingScreen is painted.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AppContent() {
  const dispatch = useAppDispatch();
  const { token, hydrated } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (!hydrated) {
      dispatch(hydrateAuth());
    }
  }, [dispatch, hydrated]);

  useEffect(() => {
    const onUrl = ({ url }: { url: string }) => {
      if (url.startsWith('growl://checkout/')) {
        handleCheckoutDeepLink(url);
      } else if (url.startsWith('growl://reset-password')) {
        console.log('[deep-link] reset password', url);
      }
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

  if (!hydrated) {
    return (
      <BrandLoadingScreen
        variant="splash"
        showWordmark
        message="Growing your session…"
        onLayout={onLoaderLayout}
      />
    );
  }

  return (
    <NavigationContainer key={token || 'no-token'} ref={navigationRef}>
      <StatusBar style="auto" />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    // Safety: if auth hydrate is instant, still drop native splash once JS is up.
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
