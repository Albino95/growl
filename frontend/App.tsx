import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { Provider } from 'react-redux';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from './src/store/store';
import RootNavigator from './src/app/navigation/RootNavigator';
import { useAuthStore } from './src/state/useAuthStore';

function AppContent() {
  const { token } = useAuthStore();
  
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
