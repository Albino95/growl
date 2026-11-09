import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { feedback } from '../../utils/interactionFeedback';

export type FeedReaction = 'like' | 'love' | 'laugh' | 'wow' | 'support' | null;

const HEART_ACTIVE = '#F97066';
const HEART_IDLE_LIGHT = '#57534E';
const HEART_IDLE_DARK = '#FFFFFF';

type Props = {
  hasLiked: boolean;
  reaction: FeedReaction;
  onPress: () => void;
  onLongPress: () => void;
  /** Light = feed cards; dark = reels overlay */
  tone?: 'light' | 'dark';
  /** Removes feed margin so icon centers in circular reel actions */
  compact?: boolean;
};

function ReactionGlyph({
  reaction,
  hasLiked,
  tone = 'light',
}: {
  reaction: FeedReaction;
  hasLiked: boolean;
  tone?: 'light' | 'dark';
}) {
  const active = hasLiked || reaction != null;
  const outlineColor = tone === 'dark' ? HEART_IDLE_DARK : HEART_IDLE_LIGHT;
  if (!active) {
    return <Ionicons name="heart-outline" size={26} color={outlineColor} />;
  }
  const r = reaction || 'love';
  switch (r) {
    case 'like':
      return <Text style={tw`text-[24px] leading-none`}>👍</Text>;
    case 'laugh':
      return <Text style={tw`text-[24px] leading-none`}>😂</Text>;
    case 'wow':
      return <Text style={tw`text-[24px] leading-none`}>😮</Text>;
    case 'support':
      return <Text style={tw`text-[24px] leading-none`}>💪</Text>;
    case 'love':
    default:
      return <Ionicons name="heart" size={26} color={HEART_ACTIVE} />;
  }
}

/** Like / reaction control — pop on like, no leftover ring at rest. */
export default function FeedLikeButton({
  hasLiked,
  reaction,
  onPress,
  onLongPress,
  tone = 'light',
  compact = false,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const prevLiked = useRef(hasLiked);

  useEffect(() => {
    if (hasLiked && !prevLiked.current) {
      ring.setValue(0);
      Animated.parallel([
        Animated.sequence([
          Animated.spring(scale, {
            toValue: 1.28,
            friction: 3.5,
            tension: 240,
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1,
            friction: 5,
            tension: 180,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(ring, {
            toValue: 1,
            duration: 380,
            useNativeDriver: true,
          }),
          // Ensure ring is fully gone after the burst (no faded leftover).
          Animated.timing(ring, {
            toValue: 0,
            duration: 1,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    } else if (!hasLiked && prevLiked.current) {
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }).start();
      ring.setValue(0);
    } else {
      // Already liked on mount / hydrate — never show a stuck ring.
      ring.setValue(0);
    }
    prevLiked.current = hasLiked;
  }, [hasLiked, scale, ring]);

  return (
    <Pressable
      onPressIn={() => {
        Animated.spring(scale, {
          toValue: 0.9,
          useNativeDriver: true,
          speed: 40,
          bounciness: 0,
        }).start();
      }}
      onPressOut={() => {
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 28,
          bounciness: 6,
        }).start();
      }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      hitSlop={10}
      style={compact ? tw`items-center justify-center` : tw`mr-3`}
      accessibilityRole="button"
      accessibilityLabel={hasLiked ? 'Unlike' : 'Like'}
    >
      <View style={tw`items-center justify-center w-8 h-8`}>
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 32,
            height: 32,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: HEART_ACTIVE,
            // Idle ring value is 0 → opacity 0 (was incorrectly 0.55 before).
            opacity: ring.interpolate({
              inputRange: [0, 0.2, 0.7, 1],
              outputRange: [0, 0.5, 0.2, 0],
            }),
            transform: [
              {
                scale: ring.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.85, 1.55],
                }),
              },
            ],
          }}
        />
        <Animated.View style={{ transform: [{ scale }] }}>
          <ReactionGlyph reaction={reaction} hasLiked={hasLiked} tone={tone} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

export function ReactionPickerBar({
  onPick,
}: {
  onPick: (r: Exclude<FeedReaction, null>) => void;
}) {
  const items: Array<{ key: Exclude<FeedReaction, null>; glyph: string }> = [
    { key: 'like', glyph: '👍' },
    { key: 'love', glyph: '❤️' },
    { key: 'laugh', glyph: '😂' },
    { key: 'wow', glyph: '😮' },
    { key: 'support', glyph: '💪' },
  ];
  const enter = useRef(new Animated.Value(0)).current;
  const scales = useRef(items.map(() => new Animated.Value(0.5))).current;

  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 7,
      tension: 140,
      useNativeDriver: true,
    }).start();
    Animated.stagger(
      35,
      scales.map((s) =>
        Animated.spring(s, {
          toValue: 1,
          friction: 4,
          tension: 200,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [enter, scales]);

  return (
    <Animated.View
      style={[
        tw`flex-row items-center rounded-2xl border border-stone-200/90 bg-[#FFFcf7] px-2.5 py-2`,
        {
          shadowColor: '#1C1917',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
          opacity: enter,
          transform: [
            {
              translateY: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
            {
              scale: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [0.94, 1],
              }),
            },
          ],
        },
      ]}
    >
      {items.map((item, index) => (
        <Pressable
          key={item.key}
          onPress={() => {
            feedback.like(true);
            onPick(item.key);
          }}
          style={({ pressed }) => [
            tw`mx-0.5 h-10 w-10 items-center justify-center rounded-xl`,
            pressed ? tw`bg-energy-50` : null,
          ]}
        >
          <Animated.Text style={[tw`text-[22px]`, { transform: [{ scale: scales[index] }] }]}>
            {item.glyph}
          </Animated.Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}
