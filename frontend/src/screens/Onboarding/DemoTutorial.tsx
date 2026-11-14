import React, { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import { radius } from '../../theme/tokens';
import PressableScale from '../../components/ui/PressableScale';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { feedback } from '../../utils/interactionFeedback';
import { useDemoTutorialStore } from '../../state/useDemoTutorialStore';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { spring } from '../../theme/motion';
import { haptic } from '../../theme/haptics';
import { CHECKIN_MOODS } from '../../components/recap/growthMeta';

type StepId = 'welcome' | 'create' | 'checkin';

type Detail = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

type Step = {
  id: StepId;
  eyebrow: string;
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  soft: string;
  details?: Detail[];
};

/**
 * Three cards, then straight into the first real win (Home's Today check-in).
 * "What brought you here?" was dropped: it gated Next, and nothing used the answer.
 * tint/soft are getters so they resolve against the active colour scheme at render.
 */
const STEPS: Step[] = [
  {
    id: 'welcome',
    eyebrow: 'Hey, you made it',
    title: 'Welcome to Grow!',
    body: 'A calm place to grow the things you care about, next to friends on the same paths.',
    icon: 'sparkles',
    get tint() {
      return theme.colors.brand;
    },
    get soft() {
      return theme.colors.brandSoft;
    },
  },
  {
    id: 'create',
    eyebrow: 'The plus',
    title: 'Made something? Tap +',
    body: 'The green button at the bottom is where everything starts.',
    icon: 'add',
    get tint() {
      return theme.colors.brand;
    },
    get soft() {
      return theme.colors.brandSoft;
    },
    details: [
      { icon: 'image-outline', title: 'Post', body: 'Share a win with your friends.' },
      { icon: 'book-outline', title: 'Journal', body: 'A private page, just for you.' },
      { icon: 'ellipse-outline', title: 'Story', body: 'A quick moment that’s gone in 24 hours.' },
    ],
  },
  {
    id: 'checkin',
    eyebrow: 'Your first step',
    title: 'Tap how you feel',
    body: 'One tap on Home each day. It takes five seconds and starts your streak.',
    icon: 'happy-outline',
    get tint() {
      return theme.colors.energy;
    },
    get soft() {
      return theme.colors.energySoft;
    },
  },
];

function Mascot({
  icon,
  tint,
  soft,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  soft: string;
}) {
  const bounce = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      // No bounce/spin; the step crossfade carries the change.
      bounce.setValue(1);
      spin.setValue(1);
      return;
    }
    bounce.setValue(0);
    spin.setValue(0);
    Animated.parallel([
      spring(bounce, 1, 'bouncy'),
      Animated.timing(spin, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start();
  }, [icon, bounce, spin, reducedMotion]);

  const scale = bounce.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] });

  return (
    <Animated.View
      style={[
        tw`w-[88px] h-[88px] rounded-full items-center justify-center mb-4 self-center`,
        { backgroundColor: soft, transform: [{ scale }, { rotate }] },
      ]}
    >
      <View
        style={[
          tw`w-[68px] h-[68px] rounded-full items-center justify-center`,
          { backgroundColor: tint },
        ]}
      >
        <Ionicons name={icon} size={32} color="#FFFFFF" />
      </View>
    </Animated.View>
  );
}

function DetailCard({ item }: { item: Detail }) {
  return (
    <View
      style={[
        tw`flex-row items-center rounded-card px-3.5 py-3 mb-2 border`,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.line },
      ]}
    >
      <View
        style={[
          tw`w-9 h-9 rounded-full items-center justify-center mr-3`,
          { backgroundColor: theme.colors.subtle },
        ]}
      >
        <Ionicons name={item.icon} size={16} color={theme.colors.brand} />
      </View>
      <View style={tw`flex-1`}>
        <Text style={tw`font-semibold text-ink`}>{item.title}</Text>
        <Text style={tw`text-footnote text-ink-3 mt-0.5`}>{item.body}</Text>
      </View>
    </View>
  );
}

/** Non-interactive preview of the Today card's mood row — the real one is on Home. */
function MoodPreview() {
  return (
    <View
      style={[
        tw`mt-5 rounded-sheet px-3 py-3.5 border flex-row justify-between`,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.line },
      ]}
      accessible
      accessibilityLabel="Moods you can pick on Home: Heavy, Tired, Okay, Good, Bright"
    >
      {CHECKIN_MOODS.map((m) => (
        <View key={m.mood} style={tw`items-center flex-1`}>
          <Text style={tw`text-[26px]`}>{m.glyph}</Text>
          <Text style={tw`text-caption text-ink-3 mt-1`}>{m.label}</Text>
        </View>
      ))}
    </View>
  );
}

type Props = {
  onFinished?: () => void;
  /** Last card's primary action: close the tour and take the user to Home's check-in. */
  onCheckIn?: () => void;
};

export default function DemoTutorial({ onFinished, onCheckIn }: Props) {
  const complete = useDemoTutorialStore((s) => s.complete);
  const requestCheckInSpotlight = useDemoTutorialStore((s) => s.requestCheckInSpotlight);
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const reducedMotion = useReducedMotion();

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const isFirst = index === 0;
  const progress = (index + 1) / STEPS.length;

  const go = (next: number) => {
    if (next < 0) return;
    if (next >= STEPS.length) {
      void finish(true);
      return;
    }
    feedback.select();
    if (reducedMotion) {
      // Opacity-only crossfade, ≤150ms total, no slide.
      slide.setValue(0);
      Animated.timing(fade, { toValue: 0, duration: 60, useNativeDriver: true }).start(() => {
        setIndex(next);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
        Animated.timing(fade, { toValue: 1, duration: 90, useNativeDriver: true }).start();
      });
      return;
    }
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(slide, {
        toValue: next > index ? -16 : 16,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIndex(next);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      slide.setValue(next > index ? 16 : -16);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
        spring(slide, 0, 'gentle'),
      ]).start();
    });
  };

  const finish = async (toCheckIn: boolean) => {
    if (toCheckIn) {
      haptic('commit');
      onCheckIn?.();
      requestCheckInSpotlight();
    } else {
      feedback.select();
    }
    await complete();
    onFinished?.();
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top', 'bottom']}>
      <View style={tw`px-gutter-wide pt-2 pb-3`}>
        <View style={tw`flex-row items-center justify-between mb-2.5`}>
          <PressableScale
            onPress={() => void finish(false)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Skip tour"
          >
            <Text style={tw`text-sm font-semibold text-ink-3`}>Skip</Text>
          </PressableScale>
          <Text style={tw`text-xs font-semibold text-ink-3`}>
            {index + 1} / {STEPS.length}
          </Text>
        </View>
        <View style={tw`h-1.5 rounded-full bg-raised overflow-hidden`}>
          <View
            style={{
              height: '100%',
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: theme.colors.brand,
              borderRadius: radius.chip,
            }}
          />
        </View>
      </View>

      <Animated.View style={[tw`flex-1`, { opacity: fade, transform: [{ translateX: slide }] }]}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={tw`flex-grow justify-center px-gutter-wide pb-4`}
          showsVerticalScrollIndicator={false}
        >
          <Mascot icon={step.icon} tint={step.tint} soft={step.soft} />
          <Text style={tw`text-caption font-semibold tracking-widest uppercase text-center`}>
            <Text style={{ color: step.tint }}>{step.eyebrow}</Text>
          </Text>
          <Text
            style={tw`text-[26px] leading-8 font-bold text-ink text-center mt-2`}
            accessibilityRole="header"
          >
            {step.title}
          </Text>
          <Text style={tw`text-body text-ink-3 leading-6 text-center mt-2.5`}>{step.body}</Text>

          {step.id === 'create' ? (
            <View style={tw`items-center mt-5 mb-4`}>
              <View
                style={[
                  tw`w-14 h-14 rounded-full items-center justify-center`,
                  { backgroundColor: theme.colors.brand },
                ]}
              >
                <Ionicons name="add" size={30} color="#FFFFFF" />
              </View>
            </View>
          ) : null}

          {step.details
            ? step.details.map((item) => <DetailCard key={item.title} item={item} />)
            : null}

          {step.id === 'checkin' ? (
            <>
              <MoodPreview />
              <Text style={tw`text-footnote text-ink-3 text-center mt-4`}>
                You can replay this tour anytime in Settings.
              </Text>
            </>
          ) : null}
        </ScrollView>
      </Animated.View>

      <View style={tw`px-gutter-wide pb-4 pt-2`}>
        <View style={tw`flex-row items-center`}>
          {!isFirst ? (
            <PressableScale
              onPress={() => go(index - 1)}
              accessibilityRole="button"
              accessibilityLabel="Previous step"
              style={tw`w-[72px] h-[50px] rounded-card border border-line bg-card items-center justify-center mr-3`}
            >
              <Ionicons name="arrow-back" size={18} color={theme.colors.ink} />
            </PressableScale>
          ) : null}
          <View style={tw`flex-1`}>
            <PrimaryButton
              label={isLast ? 'Check in now' : isFirst ? 'Let’s go' : 'Next'}
              onPress={() => (isLast ? void finish(true) : go(index + 1))}
              feedback={false}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
