import React, { useEffect } from 'react';
import { Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { Provider } from 'react-redux';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from './src/store/store';
import RootNavigator from './src/app/navigation/RootNavigator';
import { useAppDispatch, useAppSelector } from './src/store/store';
import { hydrateAuth } from './src/store/slices/authSlice';
import FullScreenLoader from './src/components/common/FullScreenLoader';
import AppDialogHost from './src/components/ui/AppDialog';
import { initMonitoring } from './src/services/monitoring';

initMonitoring();

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
      if (url.startsWith('growl://checkout/success')) {
        console.log('[deep-link] checkout success', url);
      } else if (url.startsWith('growl://checkout/cancel')) {
        console.log('[deep-link] checkout cancel', url);
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

  if (!hydrated) {
    return <FullScreenLoader />;
  }

  return (
    <NavigationContainer key={token || 'no-token'}>
      <StatusBar style="auto" />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <AppContent />
        <AppDialogHost />
      </SafeAreaProvider>
    </Provider>
  );
}
