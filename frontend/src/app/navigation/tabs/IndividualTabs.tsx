import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import FeedScreen from '../../../screens/Feed/FeedScreen';
import JournalScreen from '../../../screens/Journal/JournalScreen';
import ProfileScreen from '../../../screens/Profile/ProfileScreen';
import InstructorScreen from '../../../screens/Instructor/InstructorScreen';
import MarketplaceScreen from '../../../screens/Marketplace/MarketplaceScreen';
import { useAuthStore } from '../../../state/useAuthStore';
import tw from '../../../lib/tw';

export type IndividualTabsParamList = {
  Feed: undefined;
  Journal: undefined;
  Marketplace: undefined;
  Profile: undefined;
  Instructor: undefined;
};

const Tab = createBottomTabNavigator<IndividualTabsParamList>();

// Custom Create Post Button Component
function CreatePostButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={tw`absolute -top-7 w-14 h-14 bg-green-500 rounded-full items-center justify-center shadow-lg border-4 border-white`}
      activeOpacity={0.8}
    >
      <Ionicons name="add" size={28} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

export default function IndividualTabs() {
  const { user } = useAuthStore();
  const navigation = useNavigation();
  const isInstructor = user?.isInstructor || false;

  const handleCreatePost = () => {
    const rootNavigation = navigation.getParent() || navigation;
    rootNavigation.navigate('Post' as never);
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          if (route.name === 'Feed') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Journal') {
            iconName = focused ? 'book' : 'book-outline';
          } else if (route.name === 'Marketplace') {
            iconName = focused ? 'storefront' : 'storefront-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'Instructor') {
            iconName = focused ? 'school' : 'school-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#10B981',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          paddingBottom: 8,
          paddingTop: 8,
          height: 70,
          position: 'relative',
        },
      })}
      tabBar={(props) => {
        const routes = props.state.routes;
        const currentIndex = props.state.index;
        
        return (
          <View style={tw`bg-white border-t border-gray-200 relative`}>
            <View style={tw`flex-row items-center justify-around px-2 py-2`}>
              {/* Feed */}
              <TouchableOpacity
                onPress={() => props.navigation.navigate('Feed')}
                style={tw`items-center flex-1`}
              >
                <Ionicons
                  name={currentIndex === 0 ? 'home' : 'home-outline'}
                  size={24}
                  color={currentIndex === 0 ? '#10B981' : '#9CA3AF'}
                />
                <Text style={tw`text-xs mt-1 ${currentIndex === 0 ? 'text-green-600' : 'text-gray-500'}`}>
                  Feed
                </Text>
              </TouchableOpacity>

              {/* Journal */}
              <TouchableOpacity
                onPress={() => props.navigation.navigate('Journal')}
                style={tw`items-center flex-1`}
              >
                <Ionicons
                  name={currentIndex === 1 ? 'book' : 'book-outline'}
                  size={24}
                  color={currentIndex === 1 ? '#10B981' : '#9CA3AF'}
                />
                <Text style={tw`text-xs mt-1 ${currentIndex === 1 ? 'text-green-600' : 'text-gray-500'}`}>
                  Journal
                </Text>
              </TouchableOpacity>

              {/* Create Post Button - Centered */}
              <View style={tw`w-20 items-center`}>
                <CreatePostButton onPress={handleCreatePost} />
              </View>

              {/* Marketplace */}
              <TouchableOpacity
                onPress={() => props.navigation.navigate('Marketplace')}
                style={tw`items-center flex-1`}
              >
                <Ionicons
                  name={currentIndex === 2 ? 'storefront' : 'storefront-outline'}
                  size={24}
                  color={currentIndex === 2 ? '#10B981' : '#9CA3AF'}
                />
                <Text style={tw`text-xs mt-1 ${currentIndex === 2 ? 'text-green-600' : 'text-gray-500'}`}>
                  Shop
                </Text>
              </TouchableOpacity>

              {/* Profile */}
              <TouchableOpacity
                onPress={() => props.navigation.navigate('Profile')}
                style={tw`items-center flex-1`}
              >
                <Ionicons
                  name={currentIndex === 3 ? 'person' : 'person-outline'}
                  size={24}
                  color={currentIndex === 3 ? '#10B981' : '#9CA3AF'}
                />
                <Text style={tw`text-xs mt-1 ${currentIndex === 3 ? 'text-green-600' : 'text-gray-500'}`}>
                  Profile
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      }}
    >
      <Tab.Screen 
        name="Feed" 
        component={FeedScreen}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen 
        name="Journal" 
        component={JournalScreen}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen 
        name="Marketplace" 
        component={MarketplaceScreen}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen 
        name="Instructor"
        component={InstructorScreen}
        options={{ 
          tabBarButton: () => null,
          // Only show if user is instructor, otherwise show access denied screen
        }}
      />
    </Tab.Navigator>
  );
}
