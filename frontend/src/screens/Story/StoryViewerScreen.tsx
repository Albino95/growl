import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Dimensions,
  StatusBar,
  Image,
  Animated,
  PanResponder,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import tw from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';
import { resolveStoryDisplayUri, resolveAvatarUri, avatarSource } from '../../utils/images';
import { useAuth } from '../../store/hooks';
import { createConversation } from '../../services/api/messages';
import { viewStory } from '../../services/api/stories';
import { alertMessage } from '../../utils/confirmDialog';
import {
  lockNativeUiAudio,
  triggerPressFeedback,
  unlockNativeUiAudio,
} from '../../utils/interactionFeedback';
import { isVideoMedia } from '../../services/api/media';
import { haptic } from '../../theme/haptics';
import { duration as motionDuration, easing, timing } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { ReelVideoPlayer } from '../../components/ui/VideoEditor';
import { cacheRemoteClip } from '../../utils/cacheRemoteClip';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** A video story that never reports playback progress within this window is skipped. */
const VIDEO_STALL_SKIP_MS = 10000;
/** How long a photo story stays up before auto-advancing. */
const PHOTO_STORY_MS = 5000;

/** Opening a ring at 0 jumps to the first story not yet seen (Instagram-style). */
function startIndexFor(stories: Story[], initialIndex: number | undefined): number {
  const idx = initialIndex || 0;
  if (idx > 0 || !stories.length) return Math.min(idx, Math.max(0, stories.length - 1));
  const firstUnseen = stories.findIndex((s) => !s.hasViewed);
  return firstUnseen > 0 ? firstUnseen : 0;
}

function storyVideoTrim(url: string): { trimStartMs: number; trimEndMs: number } | undefined {
  try {
    const u = new URL(url);
    const ts = Number(u.searchParams.get('ts') || 0);
    const te = Number(u.searchParams.get('te') || 0);
    if (ts > 0 || te > 0) {
      return {
        trimStartMs: Number.isFinite(ts) ? ts : 0,
        trimEndMs: Number.isFinite(te) ? te : 0,
      };
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

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
  const { user: authUser } = useAuth();

  const [stories, setStories] = useState(initialStories);
  const storiesRef = useRef(initialStories);
  const [startIndex] = useState(() => startIndexFor(initialStories, initialIndex));
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const currentIndexRef = useRef(startIndex);
  /** Story ids actually displayed in this session — the only ones marked seen. */
  const shownIdsRef = useRef<Set<string>>(new Set());
  /** Story ids already reported to the server (one POST per story). */
  const reportedIdsRef = useRef<Set<string>>(new Set());
  const videoProgressSeenRef = useRef(false);
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [messageBusy, setMessageBusy] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [previousUserId, setPreviousUserId] = useState<string | null>(null);
  const reduced = useReducedMotion();
  /** Running photo-story progress timing (its completion advances the story). */
  const photoAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  /** Last known progress value (0..1), kept in sync so a pause can resume from it. */
  const progressValueRef = useRef(0);
  const heldRef = useRef(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    lockNativeUiAudio();
    return () => unlockNativeUiAudio();
  }, []);

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

  /** Only stories that were actually on screen count as seen. */
  const markShownViewed = () => {
    const shown = shownIdsRef.current;
    const updatedStories = storiesRef.current.map((story) =>
      shown.has(story.id) ? { ...story, hasViewed: true } : story
    );
    syncStories(updatedStories);
    onStoriesUpdate?.(updatedStories);
  };

  const markAllViewedAndClose = useRef(() => {
    markShownViewed();
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

  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => {
      progressValueRef.current = value;
    });
    return () => progressAnim.removeListener(id);
  }, [progressAnim]);

  /**
   * Run the photo progress from `from` to 1 on the native driver; its finish
   * (not a separate timer) advances, so the bar and the advance never drift.
   */
  const startPhotoProgress = useRef((from: number) => {
    photoAnimRef.current?.stop();
    const remaining = Math.max(0, 1 - from);
    progressAnim.setValue(from);
    const anim = Animated.timing(progressAnim, {
      toValue: 1,
      duration: Math.round(PHOTO_STORY_MS * remaining),
      easing: easing.linear,
      useNativeDriver: true,
    });
    photoAnimRef.current = anim;
    anim.start(({ finished }) => {
      if (photoAnimRef.current === anim) photoAnimRef.current = null;
      // No haptic on auto-advance.
      if (finished) goToNextStory();
    });
  }).current;

  /** Press-and-hold pauses the story; release resumes from the current value. */
  const pauseStory = () => {
    if (heldRef.current) return;
    heldRef.current = true;
    setHeld(true);
    if (photoAnimRef.current) {
      const anim = photoAnimRef.current;
      photoAnimRef.current = null;
      anim.stop();
      progressAnim.stopAnimation((v) => {
        progressValueRef.current = v;
      });
    }
  };

  const resumeStory = (isVideo: boolean) => {
    if (!heldRef.current) return;
    heldRef.current = false;
    setHeld(false);
    if (!isVideo && !photoAnimRef.current) startPhotoProgress(progressValueRef.current);
  };

  const tapPrevious = () => {
    if (currentIndexRef.current > 0) haptic('selection');
    goToPreviousStory();
  };

  const tapNext = () => {
    haptic('selection');
    goToNextStory();
  };

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
  const storyImageUrl = currentStory
    ? resolveStoryDisplayUri(currentStory.image, currentStory.userId, currentStory.id)
    : '';
  const isVideoStory = isVideoMedia({ uri: storyImageUrl });

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    // Check if we're switching to a different user (for transition animation)
    if (currentStory && previousUserId && currentStory.userId !== previousUserId) {
      // More noticeable transition: fade + slide when changing users
      slideAnim.setValue(reduced ? 0 : 50); // Start from right (crossfade only with reduce motion)
      Animated.parallel([
        Animated.sequence([
          timing(fadeAnim, 0, { duration: motionDuration.quick, easing: easing.in }, reduced),
          timing(fadeAnim, 1, { duration: motionDuration.gentle, easing: easing.out }, reduced),
        ]),
        timing(slideAnim, 0, { duration: motionDuration.gentle, easing: easing.out }, reduced),
      ]).start();
    } else {
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
    }
    setPreviousUserId(currentStory?.userId || null);

    const shownStory = storiesRef.current[currentIndex];
    if (shownStory) {
      shownIdsRef.current.add(shownStory.id);
      // One server view per story actually shown (skip own + already-seen ones).
      if (
        !reportedIdsRef.current.has(shownStory.id) &&
        !shownStory.hasViewed &&
        shownStory.userId !== authUser?.id
      ) {
        reportedIdsRef.current.add(shownStory.id);
        viewStory(shownStory.id).catch(() => undefined);
      }
    }

    // Mark current story as viewed + push to parent so Feed ring updates immediately
    if (shownStory && !shownStory.hasViewed) {
      const next = markIndexViewed(currentIndex);
      onStoriesUpdate?.(next);
    }

    // Warm the next story as soon as this one starts so advancing doesn't wait
    // on a download (black flash): photos into expo-image's cache, videos into
    // the local clip cache the player reads from (cacheRemoteClip dedupes, so
    // the player's own call joins this in-flight download).
    const upcoming = storiesRef.current[currentIndex + 1];
    if (upcoming) {
      const nextUri = resolveStoryDisplayUri(upcoming.image, upcoming.userId, upcoming.id);
      if (nextUri) {
        if (isVideoMedia({ uri: nextUri })) {
          void cacheRemoteClip(nextUri).catch(() => '');
        } else {
          ExpoImage.prefetch(nextUri).catch(() => undefined);
        }
      }
    }

    photoAnimRef.current?.stop();
    photoAnimRef.current = null;
    progressAnim.setValue(0);
    progressValueRef.current = 0;
    heldRef.current = false;
    setHeld(false);
    if (isVideoStory) {
      // The player has no error callback: if playback never starts, move on.
      videoProgressSeenRef.current = false;
      const stall = setTimeout(() => {
        if (!videoProgressSeenRef.current && currentIndexRef.current === currentIndex) {
          goToNextStory();
        }
      }, VIDEO_STALL_SKIP_MS);
      return () => {
        clearTimeout(stall);
        progressAnim.setValue(0);
      };
    }

    // goToNextStory closes the viewer after the last story.
    startPhotoProgress(0);

    return () => {
      photoAnimRef.current?.stop();
      photoAnimRef.current = null;
      progressAnim.setValue(0);
    };
  }, [currentIndex, isVideoStory]);

  // Removed duplicate goToNextStory / goToPreviousStory — see refs above

  const navigateToProfile = () => {
    markShownViewed();
    navigation.goBack();
    const rootNavigation = navigation.getParent() || navigation;
    rootNavigation.dispatch(CommonActions.navigate('PublicProfile', { userId: currentStory.userId, preview: { username: currentStory.username, avatarUrl: currentStory.avatar } }));
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
          {isVideoStory ? (
            <ReelVideoPlayer
              uri={storyImageUrl}
              settings={storyVideoTrim(storyImageUrl)}
              shouldPlay={!held}
              loop={false}
              contentFit="cover"
              style={tw`w-full h-full`}
              onEnded={goToNextStory}
              onProgress={(positionMs, durationMs) => {
                if (positionMs > 0 || durationMs > 0) videoProgressSeenRef.current = true;
                if (durationMs > 0) {
                  progressAnim.setValue(Math.max(0, Math.min(1, positionMs / durationMs)));
                }
              }}
            />
          ) : (
            <ExpoImage
              source={{ uri: storyImageUrl }}
              style={tw`w-full h-full`}
              contentFit="cover"
              transition={200}
            />
          )}
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
                    tw`h-full w-full bg-white`,
                    { transformOrigin: 'left', transform: [{ scaleX: progressAnim }] },
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
        <View style={tw`absolute top-12 left-0 right-0 flex-row items-center justify-between px-gutter`}>
          <PressableScale
            onPress={navigateToProfile}
            style={tw`flex-row items-center flex-1`}
          >
            <Image
              source={avatarSource(avatarUri)}
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
          </PressableScale>
          <PressableScale
            pressedScale={0.9}
            onPress={markAllViewedAndClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close story"
            style={tw`w-10 h-10 items-center justify-center`}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </PressableScale>
        </View>

        {/* Navigation Areas */}
        <View style={tw`absolute inset-0 flex-row`}>
          <Pressable
            style={tw`flex-1`}
            onPressIn={pauseStory}
            onPressOut={() => resumeStory(isVideoStory)}
            onPress={tapPrevious}
            onLongPress={() => undefined}
            delayLongPress={220}
            accessibilityRole="button"
            accessibilityLabel="Previous story"
          />
          <Pressable
            style={tw`flex-1`}
            onPressIn={pauseStory}
            onPressOut={() => resumeStory(isVideoStory)}
            onPress={tapNext}
            onLongPress={() => undefined}
            delayLongPress={220}
            accessibilityRole="button"
            accessibilityLabel="Next story"
          />
        </View>

        {/* Bottom Actions */}
        <View style={tw`absolute bottom-8 left-0 right-0 flex-row items-center justify-center px-gutter`}>
          <PressableScale
            style={tw`bg-white/20 rounded-chip px-6 py-3 flex-row items-center`}
            onPress={() => {
              if (!likedIds[currentStory.id]) haptic('tapLight');
              setLikedIds((prev) => ({
                ...prev,
                [currentStory.id]: !prev[currentStory.id],
              }));
            }}
            accessibilityLabel={likedIds[currentStory.id] ? 'Unlike story' : 'Like story'}
          >
            <Ionicons
              name={likedIds[currentStory.id] ? 'heart' : 'heart-outline'}
              size={24}
              color={likedIds[currentStory.id] ? '#F87171' : '#FFFFFF'}
            />
            <Text style={tw`text-white ml-2 font-semibold`}>
              {likedIds[currentStory.id] ? 'Liked' : 'Like'}
            </Text>
          </PressableScale>
          <PressableScale
            style={tw`bg-white/20 rounded-chip px-6 py-3 flex-row items-center ml-4 ${
              messageBusy ? 'opacity-60' : ''
            }`}
            disabled={messageBusy}
            onPress={async () => {
              if (!currentStory.userId) return;
              if (authUser?.id && authUser.id === currentStory.userId) {
                alertMessage('Your story', 'You cannot message yourself from here.');
                return;
              }
              setMessageBusy(true);
              triggerPressFeedback();
              try {
                const res = await createConversation(currentStory.userId);
                const root = navigation.getParent() || navigation;
                (root as { navigate: (a: string, b?: object) => void }).navigate('Messages', {
                  conversationId: res.data.conversation.id,
                  targetUserId: currentStory.userId,
                });
              } catch (e: unknown) {
                const msg =
                  e instanceof Error
                    ? e.message
                    : 'Could not open chat. You may need to be connected as friends first.';
                alertMessage('Message', msg);
              } finally {
                setMessageBusy(false);
              }
            }}
            accessibilityLabel="Message story author"
          >
            {messageBusy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Ionicons name="chatbubble-outline" size={24} color="#FFFFFF" />
            )}
            <Text style={tw`text-white ml-2 font-semibold`}>Message</Text>
          </PressableScale>
        </View>
      </View>
    </SafeAreaView>
  );
}
