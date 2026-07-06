import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainerRef } from '@react-navigation/native';
import AuthScreen from '../../screens/Auth/AuthScreen';
import KYCScreen from '../../screens/KYC/KYCScreen';
import CategoryPickScreen from '../../screens/Onboarding/CategoryPickScreen';
import IndividualTabs from './tabs/IndividualTabs';
import BusinessRootStack from './BusinessRootStack';
import PostScreen from '../../screens/Post/PostScreen';
import PostDetailScreen from '../../screens/Post/PostDetailScreen';
import MessagesScreen from '../../screens/Messages/MessagesScreen';
import ReelsScreen from '../../screens/Reels/ReelsScreen';
import PublicProfileScreen from '../../screens/Profile/PublicProfileScreen';
import ProductDetailScreen from '../../screens/Marketplace/ProductDetailScreen';
import CheckoutScreen from '../../screens/Marketplace/CheckoutScreen';
import UserOrdersScreen from '../../screens/Marketplace/UserOrdersScreen';
import StoryViewerScreen from '../../screens/Story/StoryViewerScreen';
import CreateStoryScreen from '../../screens/Story/CreateStoryScreen';
import { useAppSelector } from '../../store/store';
import FullScreenLoader from '../../components/common/FullScreenLoader';
import { shouldShowBusinessShell } from '../../constants/businessShell';

type PostDetailParam = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  image: string;
  caption: string;
  category: string;
  subcategory?: string;
  likes: number;
  comments: number;
  timestamp?: string;
  createdAt?: string;
  hasLiked?: boolean;
  reaction?: 'like' | 'love' | 'laugh' | 'wow' | 'support' | null;
  daysUntilDecay?: number;
};

export type RootStackParamList = {
  Auth: undefined;
  KYC: undefined;
  Categories: undefined;
  Individual: undefined;
  Business: undefined;
  Post: undefined;
  Messages: undefined;
  Reels: undefined;
  PublicProfile: { userId: string };
  PostDetail: { post: PostDetailParam };
  ProductDetail: { productId: string };
  Checkout: { items: Array<{ product_id: string; quantity: number }> };
  UserOrders: undefined;
  StoryViewer: {
    stories: Array<{
      id: string;
      userId: string;
      username: string;
      avatar: string;
      image: string;
      createdAt: string;
      views?: number;
      hasViewed?: boolean;
    }>;
    initialIndex: number;
    onStoriesUpdate?: (stories: Array<{
      id: string;
      userId: string;
      username: string;
      avatar: string;
      image: string;
      createdAt: string;
      views?: number;
      hasViewed?: boolean;
    }>) => void;
  };
  CreateStory: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { token, user, hydrated, shouldCompleteSignupOnboarding } = useAppSelector(
    (state) => state.auth
  );

  // Show category picker only for users currently in the sign-up flow.
  const needsOnboarding =
    token &&
    user &&
    shouldCompleteSignupOnboarding &&
    !user.hasCompletedOnboarding;
  
  const isBusinessAccount = shouldShowBusinessShell(user);
  const initialRouteName = !token 
    ? 'Auth' 
    : isBusinessAccount 
      ? 'Business' 
      : needsOnboarding 
        ? 'Categories' 
        : 'Individual';

  return (
    <Stack.Navigator 
      screenOptions={{ headerShown: false }}
      initialRouteName={initialRouteName}
    >
      <Stack.Screen name="Auth" component={AuthScreen} />
      <Stack.Screen name="KYC" component={KYCScreen} />
      <Stack.Screen name="Categories" component={CategoryPickScreen} />
      {!isBusinessAccount && (
        <>
          <Stack.Screen name="Individual" component={IndividualTabs} />
          <Stack.Screen
            name="Post"
            component={PostScreen}
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen name="PostDetail" component={PostDetailScreen} />
          <Stack.Screen 
            name="Messages" 
            component={MessagesScreen}
            options={{ 
              headerShown: false,
              presentation: 'card',
            }}
          />
          <Stack.Screen name="Reels" component={ReelsScreen} />
          <Stack.Screen
            name="ProductDetail"
            component={ProductDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Checkout"
            component={CheckoutScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="UserOrders"
            component={UserOrdersScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="StoryViewer"
            component={StoryViewerScreen}
            options={{ headerShown: false, presentation: 'fullScreenModal' }}
          />
          <Stack.Screen
            name="CreateStory"
            component={CreateStoryScreen}
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
        </>
      )}
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
      <Stack.Screen name="Business" component={BusinessRootStack} />
    </Stack.Navigator>
  );
}
