import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { Provider } from 'react-redux';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from './src/store/store';
import RootNavigator from './src/app/navigation/RootNavigator';
import { useAppDispatch, useAppSelector } from './src/store/store';
import { hydrateAuth } from './src/store/slices/authSlice';
import FullScreenLoader from './src/components/common/FullScreenLoader';

function AppContent() {
  const dispatch = useAppDispatch();
  const { token, hydrated } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (!hydrated) {
      dispatch(hydrateAuth());
    }
  }, [dispatch, hydrated]);

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
      </SafeAreaProvider>
    </Provider>
  );
}
