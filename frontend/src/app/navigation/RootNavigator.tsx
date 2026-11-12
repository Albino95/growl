/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
// Side effect: global Dynamic Type cap for Text / TextInput.
import OfflineBanner from '../../components/common/OfflineBanner';
import AuthScreen from '../../screens/Auth/AuthScreen';
import CategoryPickScreen from '../../screens/Onboarding/CategoryPickScreen';
import IndividualTabs from './tabs/IndividualTabs';
import BusinessRootStack from './BusinessRootStack';
import { useAppSelector } from '../../store/store';
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
  Categories: undefined;
  Individual: undefined;
  Business: undefined;
  Post:
    | {
        category?: string;
        caption?: string;
        promoteBusinessId?: string;
        promoteBusinessName?: string;
        productId?: string;
      }
    | undefined;
  Messages: { conversationId?: string; targetUserId?: string } | undefined;
  Reels:
    | {
        startPostId?: string;
        seedPost?: import('../../services/api/feed').FeedPost;
        /** home = friends/for-you reels; explore = discovery (non-friend) reels */
        mode?: 'home' | 'explore';
      }
    | undefined;
  PublicProfile: { userId: string };
  PostDetail: { post: PostDetailParam };
  ProductDetail: { productId: string };
  Checkout: { items: Array<{ product_id: string; quantity: number }> };
  UserOrders: undefined;
  OrderConfirmation: {
    orderId?: string;
    sessionId?: string;
    cancelled?: boolean;
  };
  EditProfile: undefined;
  Settings: undefined;
  NotificationPrefs: undefined;
  Notifications: undefined;
  Garden: undefined;
  PlantSeed: undefined;
  SeedDetail: { seedId: string };
  Circles: undefined;
  CircleDetail: { groupId: string };
  CoachingContract: { contractId: string };
  Instructors: undefined;
  AppReviews: undefined;
  Legal: undefined;
  LegalDocument: { documentId: 'terms' | 'privacy' | 'community' | 'support' };
  DeleteAccount: undefined;
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
  CreateReel: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/*
 * Startup cost: only the entry screens (Auth, Categories, Individual tabs,
 * Business shell) are imported eagerly. Every other route uses
 * `getComponent` so its module — and its dependency tree (editors, players,
 * checkout, legal text…) — is evaluated on first navigation instead of at
 * launch.
 */

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
    <View style={styles.root}>
      <Stack.Navigator 
        screenOptions={{ headerShown: false }}
        initialRouteName={initialRouteName}
      >
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="Categories" component={CategoryPickScreen} />
        {!isBusinessAccount && (
          <>
            <Stack.Screen name="Individual" component={IndividualTabs} />
            <Stack.Screen
              name="Post"
              getComponent={() => require('../../screens/Post/PostScreen').default}
              options={{
                headerShown: false,
                // card + slide, not UIKit modal — ImagePicker must not dismiss this screen
                presentation: 'card',
                animation: 'slide_from_bottom',
                gestureEnabled: false,
              }}
            />
            <Stack.Screen name="PostDetail" getComponent={() => require('../../screens/Post/PostDetailScreen').default} />
            <Stack.Screen 
              name="Messages" 
              getComponent={() => require('../../screens/Messages/MessagesScreen').default}
              options={{ 
                headerShown: false,
                presentation: 'card',
              }}
            />
            <Stack.Screen name="Reels" getComponent={() => require('../../screens/Reels/ReelsScreen').default} />
            <Stack.Screen
              name="ProductDetail"
              getComponent={() => require('../../screens/Marketplace/ProductDetailScreen').default}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Checkout"
              getComponent={() => require('../../screens/Marketplace/CheckoutScreen').default}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="UserOrders"
              getComponent={() => require('../../screens/Marketplace/UserOrdersScreen').default}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="OrderConfirmation"
              getComponent={() => require('../../screens/Marketplace/OrderConfirmationScreen').default}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="EditProfile"
              getComponent={() => require('../../screens/Profile/EditProfileScreen').default}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Settings"
              getComponent={() => require('../../screens/Profile/SettingsScreen').default}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="NotificationPrefs"
              getComponent={() => require('../../screens/Profile/NotificationPrefsScreen').default}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Notifications"
              getComponent={() => require('../../screens/Activity/NotificationsScreen').default}
              options={{ headerShown: false }}
            />
            <Stack.Screen name="Garden" getComponent={() => require('../../screens/Garden/GardenScreen').default} options={{ headerShown: false }} />
            <Stack.Screen
              name="PlantSeed"
              getComponent={() => require('../../screens/Garden/PlantSeedScreen').default}
              options={{
                headerShown: false,
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="SeedDetail"
              getComponent={() => require('../../screens/Garden/SeedDetailScreen').default}
              options={{ headerShown: false }}
            />
            <Stack.Screen name="Circles" getComponent={() => require('../../screens/Circles/CirclesScreen').default} options={{ headerShown: false }} />
            <Stack.Screen
              name="CircleDetail"
              getComponent={() => require('../../screens/Circles/CircleDetailScreen').default}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="CoachingContract"
              getComponent={() => require('../../screens/Instructor/CoachingContractScreen').default}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Instructors"
              getComponent={() => require('../../screens/Instructor/InstructorsScreen').default}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="StoryViewer"
              getComponent={() => require('../../screens/Story/StoryViewerScreen').default}
              options={{ headerShown: false, presentation: 'fullScreenModal' }}
            />
            <Stack.Screen
              name="CreateStory"
              getComponent={() => require('../../screens/Story/CreateStoryScreen').default}
              options={{
                headerShown: false,
                presentation: 'card',
                animation: 'slide_from_bottom',
                gestureEnabled: false,
              }}
            />
            <Stack.Screen
              name="CreateReel"
              getComponent={() => require('../../screens/Reels/CreateReelScreen').default}
              options={{
                headerShown: false,
                presentation: 'card',
                animation: 'slide_from_bottom',
                gestureEnabled: false,
              }}
            />
          </>
        )}
        <Stack.Screen name="PublicProfile" getComponent={() => require('../../screens/Profile/PublicProfileScreen').default} />
        <Stack.Screen
          name="AppReviews"
          getComponent={() => require('../../screens/Feedback/AppReviewsScreen').default}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Legal" getComponent={() => require('../../screens/Legal/LegalHubScreen').default} options={{ headerShown: false }} />
        <Stack.Screen
          name="LegalDocument"
          getComponent={() => require('../../screens/Legal/LegalDocumentScreen').default}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="DeleteAccount"
          getComponent={() => require('../../screens/Profile/DeleteAccountScreen').default}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Business" component={BusinessRootStack} />
      </Stack.Navigator>
      <OfflineBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
