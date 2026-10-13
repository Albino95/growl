import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { feedback } from '../../utils/interactionFeedback';

export type FeedReaction = 'like' | 'love' | 'laugh' | 'wow' | 'support' | null;

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
  const outlineColor = tone === 'dark' ? '#FFFFFF' : '#374151';
  if (!active) {
    return <Ionicons name="heart-outline" size={28} color={outlineColor} />;
  }
  const r = reaction || 'love';
  switch (r) {
    case 'like':
      return <Text style={tw`text-[26px] leading-none`}>👍</Text>;
    case 'laugh':
      return <Text style={tw`text-[26px] leading-none`}>😂</Text>;
    case 'wow':
      return <Text style={tw`text-[26px] leading-none`}>😮</Text>;
    case 'support':
      return <Text style={tw`text-[26px] leading-none`}>💪</Text>;
    case 'love':
    default:
      return <Ionicons name="heart" size={28} color="#EF4444" />;
  }
}

/** Like / reaction control with a punchy heart pop when filled. */
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
            toValue: 1.45,
            friction: 3,
            tension: 260,
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1,
            friction: 5,
            tension: 170,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(ring, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (!hasLiked && prevLiked.current) {
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }).start();
      ring.setValue(0);
    }
    prevLiked.current = hasLiked;
  }, [hasLiked, scale, ring]);

  return (
    <Pressable
      onPressIn={() => {
        Animated.spring(scale, {
          toValue: 0.88,
          useNativeDriver: true,
          speed: 40,
          bounciness: 0,
        }).start();
      }}
      onPressOut={() => {
        if (!hasLiked) {
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            speed: 28,
            bounciness: 6,
          }).start();
        }
      }}
      onPress={() => {
        // Parent toggles like + fires feedback.like; keep a light tap if already synced.
        onPress();
      }}
      onLongPress={onLongPress}
      delayLongPress={280}
      hitSlop={10}
      style={compact ? tw`items-center justify-center` : tw`mr-3`}
      accessibilityRole="button"
      accessibilityLabel={hasLiked ? 'Unlike' : 'Like'}
    >
      <View style={tw`items-center justify-center w-9 h-9`}>
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 2,
            borderColor: '#F97066',
            opacity: ring.interpolate({
              inputRange: [0, 0.35, 1],
              outputRange: [0.55, 0.35, 0],
            }),
            transform: [
              {
                scale: ring.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.6, 1.65],
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
        tw`flex-row items-center rounded-full border border-stone-200 bg-white px-2 py-2 shadow-lg`,
        {
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
                outputRange: [0.92, 1],
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
            tw`mx-1 h-10 w-10 items-center justify-center rounded-full`,
            pressed ? tw`bg-rose-50` : null,
          ]}
        >
          <Animated.Text style={[tw`text-2xl`, { transform: [{ scale: scales[index] }] }]}>
            {item.glyph}
          </Animated.Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}
