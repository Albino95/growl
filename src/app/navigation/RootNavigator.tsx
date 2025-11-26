import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AuthScreen from '../../screens/Auth/AuthScreen';
import KYCScreen from '../../screens/KYC/KYCScreen';
import CategoryPickScreen from '../../screens/Onboarding/CategoryPickScreen';
import IndividualTabs from './tabs/IndividualTabs';
import BusinessTabs from './tabs/BusinessTabs';
import PostScreen from '../../screens/Post/PostScreen';
import { useAuthStore } from '../../state/useAuthStore';
import FullScreenLoader from '../../components/common/FullScreenLoader';

export type RootStackParamList = {
  Auth: undefined;
  KYC: undefined;
  Categories: undefined;
  Individual: undefined;
  Business: undefined;
  Post: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { token, user, hydrated, hydrate } = useAuthStore();
  useEffect(() => { if (!hydrated) hydrate(); }, [hydrated, hydrate]);
  if (!hydrated) return <FullScreenLoader />;

  // Check if user needs onboarding
  const needsOnboarding = token && user && !user.hasCompletedOnboarding;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {token ? (
        needsOnboarding ? (
          <Stack.Screen name="Categories" component={CategoryPickScreen} />
        ) : (
          <>
            <Stack.Screen name="Individual" component={IndividualTabs} />
            <Stack.Screen name="Post" component={PostScreen} />
            {user?.isInstructor && <Stack.Screen name="Business" component={BusinessTabs} />}
          </>
        )
      ) : (
        <>
          <Stack.Screen name="Auth" component={AuthScreen} />
          <Stack.Screen name="KYC" component={KYCScreen} />
          <Stack.Screen name="Categories" component={CategoryPickScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
