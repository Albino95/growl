import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import FeedScreen from '../../../screens/Feed/FeedScreen';
import ExploreScreen from '../../../screens/Explore/ExploreScreen';
import JournalScreen from '../../../screens/Journal/JournalScreen';
import ProfileScreen from '../../../screens/Profile/ProfileScreen';
import InstructorScreen from '../../../screens/Instructor/InstructorScreen';
import MarketplaceScreen from '../../../screens/Marketplace/MarketplaceScreen';
import { useAuth } from '../../../store/hooks';
import tw from '../../../lib/tw';

export type IndividualTabsParamList = {
  Feed: undefined;
  Explore: undefined;
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
      style={tw`absolute -top-7 w-14 h-14 bg-emerald-600 rounded-full items-center justify-center shadow-lg border-4 border-white`}
      activeOpacity={0.8}
    >
      <Ionicons name="add" size={28} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

export default function IndividualTabs() {
  const { user } = useAuth();
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
          } else if (route.name === 'Explore') {
            iconName = focused ? 'compass' : 'compass-outline';
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
        tabBarActiveTintColor: '#059669',
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
        const currentRoute = routes[props.state.index]?.name;

        return (
          <View style={tw`bg-stone-50 border-t border-stone-200 relative`}>
            <View style={tw`flex-row items-center justify-around px-1 py-2 pb-1`}>
              <TouchableOpacity
                onPress={() => props.navigation.navigate('Feed')}
                style={tw`items-center flex-1`}
              >
                <Ionicons
                  name={currentRoute === 'Feed' ? 'home' : 'home-outline'}
                  size={22}
                  color={currentRoute === 'Feed' ? '#059669' : '#A8A29E'}
                />
                <Text style={tw`text-xs mt-1 ${currentRoute === 'Feed' ? 'text-emerald-700 font-medium' : 'text-stone-500'}`}>
                  Feed
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => props.navigation.navigate('Explore')}
                style={tw`items-center flex-1`}
              >
                <Ionicons
                  name={currentRoute === 'Explore' ? 'compass' : 'compass-outline'}
                  size={22}
                  color={currentRoute === 'Explore' ? '#7C3AED' : '#A8A29E'}
                />
                <Text style={tw`text-xs mt-1 ${currentRoute === 'Explore' ? 'text-violet-700 font-medium' : 'text-stone-500'}`}>
                  Explore
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => props.navigation.navigate('Journal')}
                style={tw`items-center flex-1`}
              >
                <Ionicons
                  name={currentRoute === 'Journal' ? 'book' : 'book-outline'}
                  size={22}
                  color={currentRoute === 'Journal' ? '#059669' : '#A8A29E'}
                />
                <Text style={tw`text-xs mt-1 ${currentRoute === 'Journal' ? 'text-emerald-700 font-medium' : 'text-stone-500'}`}>
                  Journal
                </Text>
              </TouchableOpacity>

              <View style={tw`w-16 items-center`}>
                <CreatePostButton onPress={handleCreatePost} />
              </View>

              <TouchableOpacity
                onPress={() => props.navigation.navigate('Marketplace')}
                style={tw`items-center flex-1`}
              >
                <Ionicons
                  name={currentRoute === 'Marketplace' ? 'storefront' : 'storefront-outline'}
                  size={22}
                  color={currentRoute === 'Marketplace' ? '#059669' : '#A8A29E'}
                />
                <Text style={tw`text-xs mt-1 ${currentRoute === 'Marketplace' ? 'text-emerald-700 font-medium' : 'text-stone-500'}`}>
                  Shop
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => props.navigation.navigate('Profile')}
                style={tw`items-center flex-1`}
              >
                <Ionicons
                  name={currentRoute === 'Profile' ? 'person' : 'person-outline'}
                  size={22}
                  color={currentRoute === 'Profile' ? '#059669' : '#A8A29E'}
                />
                <Text style={tw`text-xs mt-1 ${currentRoute === 'Profile' ? 'text-emerald-700 font-medium' : 'text-stone-500'}`}>
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
        name="Explore" 
        component={ExploreScreen}
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
