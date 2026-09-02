import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Image,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import tw from '../../lib/tw';
import { resolveStoryDisplayUri, resolveAvatarUri } from '../../utils/images';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type Story = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  image?: string;
  createdAt: string;
  views?: number;
  hasViewed?: boolean;
};

type StoryViewerRouteParams = {
  StoryViewer: {
    stories: Story[];
    initialIndex: number;
    onStoriesUpdate?: (stories: Story[]) => void;
  };
};

type StoryViewerRouteProp = RouteProp<StoryViewerRouteParams, 'StoryViewer'>;

export default function StoryViewerScreen() {
  const navigation = useNavigation();
  const route = useRoute<StoryViewerRouteProp>();
  const { stories: initialStories, initialIndex, onStoriesUpdate } = route.params;

  const [stories, setStories] = useState(initialStories);
  const storiesRef = useRef(initialStories);
  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);
  const currentIndexRef = useRef(initialIndex || 0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [previousUserId, setPreviousUserId] = useState<string | null>(null);

  const syncStories = (next: Story[]) => {
    storiesRef.current = next;
    setStories(next);
  };

  const markIndexViewed = (index: number) => {
    const next = storiesRef.current.map((story, i) =>
      i === index ? { ...story, hasViewed: true } : story
    );
    syncStories(next);
    return next;
  };

  const markAllViewedAndClose = useRef(() => {
    const updatedStories = storiesRef.current.map((story) => ({ ...story, hasViewed: true }));
    syncStories(updatedStories);
    onStoriesUpdate?.(updatedStories);
    navigation.goBack();
  }).current;

  const goToNextStory = useRef(() => {
    const idx = currentIndexRef.current;
    markIndexViewed(idx);

    if (idx < storiesRef.current.length - 1) {
      const next = idx + 1;
      currentIndexRef.current = next;
      setCurrentIndex(next);
      progressAnim.setValue(0);
    } else {
      markAllViewedAndClose();
    }
  }).current;

  const goToPreviousStory = useRef(() => {
    const idx = currentIndexRef.current;
    if (idx > 0) {
      const next = idx - 1;
      currentIndexRef.current = next;
      setCurrentIndex(next);
      progressAnim.setValue(0);
    }
  }).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
      onPanResponderRelease: (_evt, gestureState) => {
        const { dx, dy } = gestureState;
        const swipeThreshold = 50;

        if (dx < -swipeThreshold && Math.abs(dy) < Math.abs(dx)) {
          goToNextStory();
        } else if (dx > swipeThreshold && Math.abs(dy) < Math.abs(dx)) {
          goToPreviousStory();
        } else if (dy > swipeThreshold && Math.abs(dx) < Math.abs(dy)) {
          markAllViewedAndClose();
        }
      },
    })
  ).current;

  const currentStory = stories[currentIndex];

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    // Check if we're switching to a different user (for transition animation)
    if (currentStory && previousUserId && currentStory.userId !== previousUserId) {
      // More noticeable transition: fade + slide when changing users
      slideAnim.setValue(50); // Start from right
      Animated.parallel([
        Animated.sequence([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    } else {
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
    }
    setPreviousUserId(currentStory?.userId || null);

    // Mark current story as viewed + push to parent so Feed ring updates immediately
    if (storiesRef.current[currentIndex] && !storiesRef.current[currentIndex].hasViewed) {
      const next = markIndexViewed(currentIndex);
      onStoriesUpdate?.(next);
    }

    // Auto-advance story after 5 seconds
    const timer = setTimeout(() => {
      if (currentIndexRef.current < storiesRef.current.length - 1) {
        goToNextStory();
      } else {
        markAllViewedAndClose();
      }
    }, 5000);

    // Progress animation
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 5000,
      useNativeDriver: false,
    }).start();

    return () => {
      clearTimeout(timer);
      progressAnim.setValue(0);
    };
  }, [currentIndex]);

  // Removed duplicate goToNextStory / goToPreviousStory — see refs above

  const navigateToProfile = () => {
    const updatedStories = storiesRef.current.map((story) => ({ ...story, hasViewed: true }));
    syncStories(updatedStories);
    onStoriesUpdate?.(updatedStories);
    navigation.goBack();
    const rootNavigation = navigation.getParent() || navigation;
    rootNavigation.navigate('PublicProfile' as never, { userId: currentStory.userId } as never);
  };

  if (!currentStory) {
    return (
      <SafeAreaView style={tw`flex-1 bg-black`}>
        <View style={tw`flex-1 items-center justify-center`}>
          <Text style={tw`text-white`}>Story not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const storyImageUrl = resolveStoryDisplayUri(currentStory.image, currentStory.userId, currentStory.id);
  const avatarUri = resolveAvatarUri(currentStory.userId, currentStory.username, currentStory.avatar);

  return (
    <SafeAreaView style={tw`flex-1 bg-black`} edges={[]}>
      <StatusBar barStyle="light-content" />
      <View style={tw`flex-1`} {...panResponder.panHandlers}>
        {/* Story Image */}
        <Animated.View
          style={[
            tw`flex-1`,
            {
              opacity: fadeAnim,
              transform: [
                {
                  translateX: slideAnim.interpolate({
                    inputRange: [0, 50],
                    outputRange: [0, SCREEN_WIDTH],
                  }),
                },
              ],
            },
          ]}
        >
          <ExpoImage
            source={{ uri: storyImageUrl }}
            style={tw`w-full h-full`}
            contentFit="cover"
            transition={200}
          />
        </Animated.View>

        {/* Progress Bar */}
        <View style={tw`absolute top-0 left-0 right-0 flex-row px-2 pt-2`}>
          {stories.map((_, index) => (
            <View
              key={index}
              style={tw`flex-1 h-1 bg-white/30 mx-1 rounded-full overflow-hidden`}
            >
              {index === currentIndex && (
                <Animated.View
                  style={[
                    tw`h-full bg-white`,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              )}
              {index < currentIndex && (
                <View style={tw`h-full bg-white w-full`} />
              )}
            </View>
          ))}
        </View>

        {/* Header */}
        <View style={tw`absolute top-12 left-0 right-0 flex-row items-center justify-between px-4`}>
          <TouchableOpacity
            onPress={navigateToProfile}
            style={tw`flex-row items-center flex-1`}
          >
            <Image
              source={{ uri: avatarUri }}
              style={tw`w-10 h-10 rounded-full border-2 border-white mr-3`}
            />
            <View>
              <Text style={tw`text-white font-semibold text-base`}>
                {currentStory.username}
              </Text>
              <Text style={tw`text-white/70 text-xs`}>
                {new Date(currentStory.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={markAllViewedAndClose}
            style={tw`w-10 h-10 items-center justify-center`}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Navigation Areas */}
        <View style={tw`absolute inset-0 flex-row`}>
          <TouchableOpacity
            style={tw`flex-1`}
            onPress={goToPreviousStory}
            activeOpacity={1}
          />
          <TouchableOpacity
            style={tw`flex-1`}
            onPress={goToNextStory}
            activeOpacity={1}
          />
        </View>

        {/* Bottom Actions */}
        <View style={tw`absolute bottom-8 left-0 right-0 flex-row items-center justify-center px-4`}>
          <TouchableOpacity
            style={tw`bg-white/20 rounded-full px-6 py-3 flex-row items-center`}
            onPress={() => {
              // Like story
              console.log('Like story:', currentStory.id);
            }}
          >
            <Ionicons name="heart-outline" size={24} color="#FFFFFF" />
            <Text style={tw`text-white ml-2 font-semibold`}>Like</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={tw`bg-white/20 rounded-full px-6 py-3 flex-row items-center ml-4`}
            onPress={() => {
              // Send message
              console.log('Send message to:', currentStory.userId);
            }}
          >
            <Ionicons name="chatbubble-outline" size={24} color="#FFFFFF" />
            <Text style={tw`text-white ml-2 font-semibold`}>Message</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
