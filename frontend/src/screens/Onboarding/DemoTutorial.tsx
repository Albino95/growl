import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { theme } from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { feedback } from '../../utils/interactionFeedback';
import { useDemoTutorialStore } from '../../state/useDemoTutorialStore';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { spring } from '../../theme/motion';

type StepId =
  | 'welcome'
  | 'intent'
  | 'dock'
  | 'paths'
  | 'home'
  | 'explore'
  | 'journal'
  | 'create'
  | 'reels'
  | 'instructors'
  | 'shop'
  | 'you'
  | 'inbox'
  | 'later';

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

const STEPS: Step[] = [
  {
    id: 'welcome',
    eyebrow: 'Hey, you made it',
    title: 'Welcome to Grow!',
    body: 'A little greenhouse for becoming someone. This tour is the map — tap through, skip anytime, replay later from Settings.',
    icon: 'sparkles',
    tint: theme.colors.brand,
    soft: theme.colors.brandSoft,
    details: [
      { icon: 'heart-outline', title: 'Soft, not shouty', body: 'Cream cards, emerald actions, coral for the good moments.' },
      { icon: 'people-outline', title: 'People on your paths', body: 'Friends, coaches, and posts from the areas you chose.' },
    ],
  },
  {
    id: 'intent',
    eyebrow: 'Quick vibe check',
    title: 'What brought you here?',
    body: 'Tap one. There is no wrong answer — it just helps us say hi the right way.',
    icon: 'happy-outline',
    tint: theme.colors.energy,
    soft: theme.colors.energySoft,
  },
  {
    id: 'dock',
    eyebrow: 'The bottom bar',
    title: 'Five rooms. One plus.',
    body: 'Home · Explore · Journal · Shop · You. The green + in the middle is how you make something. Shop is there so creating never feels like shopping.',
    icon: 'apps-outline',
    tint: theme.colors.brand,
    soft: theme.colors.brandSoft,
    details: [
      { icon: 'home-outline', title: 'Home', body: 'Friends, stories, and reels from people you know.' },
      { icon: 'compass-outline', title: 'Explore', body: 'Wander people and posts you have not met yet.' },
      { icon: 'book-outline', title: 'Journal', body: 'Your quiet pages. Private until you say otherwise.' },
      { icon: 'storefront-outline', title: 'Shop', body: 'Tools and goods on your paths. Cart lives here.' },
      { icon: 'person-outline', title: 'You', body: 'Profile, paths, friends, instructors, reviews.' },
    ],
  },
  {
    id: 'paths',
    eyebrow: 'Your paths',
    title: 'You already picked where you want to grow',
    body: 'Up to three growth areas. They shape your Home, who you meet, and what the Shop ranks first. Change them anytime on You.',
    icon: 'map-outline',
    tint: '#B45309',
    soft: '#FEF3C7',
    details: [
      { icon: 'people-outline', title: 'Cohort friends', body: 'People on overlapping paths get connected automatically. Friends you add yourself stay.' },
      { icon: 'swap-horizontal-outline', title: 'Change paths later', body: 'You → Your growth paths. Auto-connections update. Manual friends do not vanish.' },
    ],
  },
  {
    id: 'home',
    eyebrow: 'Home',
    title: 'This is where your people live',
    body: 'Stories on top (24 hours, then gone). Posts and 9:16 reels below. Like, comment, or tap a clip to open the full viewer.',
    icon: 'home',
    tint: theme.colors.brand,
    soft: theme.colors.brandSoft,
    details: [
      { icon: 'ellipse-outline', title: 'Stories', body: 'Round faces at the top. Yours first. They expire in a day.' },
      { icon: 'heart-outline', title: 'Reactions', body: 'Like and comment on friends’ posts. Soft haptics if you left those on.' },
      { icon: 'play-circle-outline', title: 'Reels from Home', body: 'The play button in the header opens friends’ reels full-screen.' },
      { icon: 'time-outline', title: 'Posts fade', body: 'Older posts quietly decay so the feed stays alive. You set the timer on You.' },
    ],
  },
  {
    id: 'explore',
    eyebrow: 'Explore',
    title: 'Wander a bit',
    body: 'Discovery for people who are not friends yet. Filter by a path chip. Instructors who teach that path show up too.',
    icon: 'compass',
    tint: theme.colors.brand,
    soft: theme.colors.brandSoft,
    details: [
      { icon: 'search-outline', title: 'Find people', body: 'Search names. Open a public profile. Add friend if it clicks.' },
      { icon: 'school-outline', title: 'See all instructors', body: 'The Instructors strip has See all — that is the hire page.' },
      { icon: 'play-outline', title: 'Explore reels', body: 'Clips from outside your circle. Tap one and swipe.' },
    ],
  },
  {
    id: 'journal',
    eyebrow: 'Journal',
    title: 'Write it down. Nobody has to see it.',
    body: 'Pencil in the header. Private by default. Mood, a line, a win. Two rooms: Your pages, and Voices from friends who shared.',
    icon: 'book',
    tint: '#B45309',
    soft: '#FEF3C7',
    details: [
      { icon: 'lock-closed-outline', title: 'Your pages', body: 'Today and Timeline. Streaks, moods, reflections when someone replies.' },
      { icon: 'chatbubbles-outline', title: 'Voices', body: 'A friend’s shared note. Reply to a line or message them privately.' },
      { icon: 'eye-outline', title: 'Going public', body: 'You choose when a page is visible. It is never the default.' },
    ],
  },
  {
    id: 'create',
    eyebrow: 'The plus',
    title: 'The green button is your “I did a thing”',
    body: 'Bottom center. It opens a sheet — never the camera by accident.',
    icon: 'add',
    tint: theme.colors.brand,
    soft: theme.colors.brandSoft,
    details: [
      { icon: 'book-outline', title: 'Journal entry', body: 'Fastest way to a private page.' },
      { icon: 'image-outline', title: 'New post', body: 'A still, a caption, a path. Lives on Home and You.' },
      { icon: 'film-outline', title: 'New reel', body: 'Capture → preview → optional edit → publish. You are never shoved into the editor.' },
      { icon: 'ellipse-outline', title: 'New story', body: 'Ephemeral. 24 hours. The top strip only.' },
    ],
  },
  {
    id: 'reels',
    eyebrow: 'Reels',
    title: 'Portrait, muted, then yours',
    body: 'Tap a clip on Home or Explore. Swipe the next. Sound when you want it. Creating one: film, look, then sound.',
    icon: 'film',
    tint: theme.colors.energy,
    soft: theme.colors.energySoft,
    details: [
      { icon: 'phone-portrait-outline', title: '9:16 viewer', body: 'Full-screen, vertical. Chrome stays quiet.' },
      { icon: 'cut-outline', title: 'Editor tabs', body: 'Edit (trim, text, tools), Look, Sound. Skip the editor if the take is enough.' },
    ],
  },
  {
    id: 'instructors',
    eyebrow: 'Instructors',
    title: 'A real person, a written plan',
    body: 'Find a coach on Explore, You, or Settings. Reach out — that unlocks a chat. After you talk, they send a proposal. You accept and it becomes a plan.',
    icon: 'school',
    tint: theme.colors.brand,
    soft: theme.colors.brandSoft,
    details: [
      { icon: 'chatbubble-outline', title: 'Reach out', body: 'On their profile. No friends-only wall. You can talk first.' },
      { icon: 'document-text-outline', title: 'Proposal → plan', body: 'Weeks, sessions, € per week. Accept and it is a contract. Billing comes later.' },
      { icon: 'star-outline', title: 'Reviews after 4 weeks', body: 'Only people who finished at least four weeks can rate a coach. Coaches can rate your follow-through too. No fake stars.' },
      { icon: 'ribbon-outline', title: 'Want to teach?', body: 'Earn peer endorsements, then claim Instructor on You. Hub is also in Settings.' },
    ],
  },
  {
    id: 'shop',
    eyebrow: 'Shop',
    title: 'Tools for the path, not a mall',
    body: 'The Shop tab. Search, filter by your paths, open a product, checkout. Orders live in Settings → My orders.',
    icon: 'storefront',
    tint: theme.colors.brand,
    soft: theme.colors.brandSoft,
    details: [
      { icon: 'search-outline', title: 'Search + chips', body: 'Keyword and your growth areas. Sub-paths if you picked one.' },
      { icon: 'cart-outline', title: 'Cart & checkout', body: 'Card checkout for goods. Coaching money is not in Shop.' },
      { icon: 'receipt-outline', title: 'My orders', body: 'Settings → My orders. Tracking when a seller ships.' },
    ],
  },
  {
    id: 'you',
    eyebrow: 'You',
    title: 'Your face, your paths, your people',
    body: 'Last tab. Avatar, stats, posts, stories. Edit profile from Settings. Share a card if you want someone to find you.',
    icon: 'person',
    tint: theme.colors.brand,
    soft: theme.colors.brandSoft,
    details: [
      { icon: 'map-outline', title: 'Growth paths', body: 'The cream card on You. This is how you change them.' },
      { icon: 'people-outline', title: 'Friends', body: 'Open another profile to Add friend. Block and report live there too.' },
      { icon: 'school-outline', title: 'Instructors + plans', body: 'Find a coach, or open Instructor Hub / My coaching plan if you have one.' },
      { icon: 'chatbubble-ellipses-outline', title: 'Review Grow!', body: 'The coral row on You. Also in Settings. We read every note.' },
    ],
  },
  {
    id: 'inbox',
    eyebrow: 'Bell and messages',
    title: 'We tap you on the shoulder',
    body: 'Home header: the bell is activity (likes, endorsements, coaching, replies). The bubble is DMs — friends and coaches you reached out to.',
    icon: 'notifications-outline',
    tint: theme.colors.energy,
    soft: theme.colors.energySoft,
    details: [
      { icon: 'notifications-outline', title: 'Notifications', body: 'Tap a row to jump to the post, the plan, or the chat.' },
      { icon: 'chatbubbles-outline', title: 'Messages', body: 'Coaching threads get a small banner so you can send or accept a plan from the chat.' },
      { icon: 'options-outline', title: 'Quiet it', body: 'Settings → Notifications for push prefs. Haptics and UI sounds have their own switches.' },
    ],
  },
  {
    id: 'later',
    eyebrow: 'Find these later',
    title: 'Reviews and this tour live in Settings',
    body: 'We will not dump you into a form. When you have something to say — or want this walkthrough again — you already know the door.',
    icon: 'trail-sign-outline',
    tint: theme.colors.energy,
    soft: theme.colors.energySoft,
  },
];

const INTENTS = [
  { id: 'learn', label: 'I’m here to learn', icon: 'bulb-outline' as const },
  { id: 'teach', label: 'I might teach', icon: 'school-outline' as const },
  { id: 'browse', label: 'Just browsing', icon: 'compass-outline' as const },
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
        tw`flex-row items-start rounded-2xl px-3.5 py-3 mb-2 border`,
        { backgroundColor: theme.colors.card, borderColor: 'rgba(28,25,23,0.08)' },
      ]}
    >
      <View
        style={[
          tw`w-9 h-9 rounded-full items-center justify-center mr-3 mt-0.5`,
          { backgroundColor: theme.colors.subtle },
        ]}
      >
        <Ionicons name={item.icon} size={16} color={theme.colors.brand} />
      </View>
      <View style={tw`flex-1`}>
        <Text style={tw`font-semibold text-stone-900`}>{item.title}</Text>
        <Text style={tw`text-sm text-stone-500 leading-5 mt-0.5`}>{item.body}</Text>
      </View>
    </View>
  );
}

type Props = {
  onFinished?: () => void;
};

export default function DemoTutorial({ onFinished }: Props) {
  const complete = useDemoTutorialStore((s) => s.complete);
  const [index, setIndex] = useState(0);
  const [intent, setIntent] = useState<string | null>(null);
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
      void finish();
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

  const finish = async () => {
    feedback.success();
    await complete();
    onFinished?.();
  };

  const intentLine = useMemo(() => {
    if (intent === 'learn') return 'Nice. We’ll keep the path quiet and useful.';
    if (intent === 'teach') return 'Lovely. Instructor Hub is waiting on You when you’re ready.';
    if (intent === 'browse') return 'Wander away. Explore is built for that.';
    return null;
  }, [intent]);

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top', 'bottom']}>
      <View style={tw`px-5 pt-2 pb-3`}>
        <View style={tw`flex-row items-center justify-between mb-2.5`}>
          <Pressable
            onPress={() => void finish()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Skip tutorial"
          >
            <Text style={tw`text-sm font-semibold text-stone-500`}>Skip</Text>
          </Pressable>
          <Text style={tw`text-xs font-semibold text-stone-400`}>
            {index + 1} / {STEPS.length}
          </Text>
        </View>
        <View style={tw`h-1.5 rounded-full bg-stone-200 overflow-hidden`}>
          <View
            style={{
              height: '100%',
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: theme.colors.brand,
              borderRadius: 999,
            }}
          />
        </View>
      </View>

      <Animated.View style={[tw`flex-1`, { opacity: fade, transform: [{ translateX: slide }] }]}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={tw`px-5 pb-4`}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Mascot icon={step.icon} tint={step.tint} soft={step.soft} />
          <Text style={tw`text-[11px] font-semibold tracking-widest uppercase text-center`}>
            <Text style={{ color: step.tint }}>{step.eyebrow}</Text>
          </Text>
          <Text style={tw`text-[26px] leading-8 font-bold text-stone-900 text-center mt-2`}>
            {step.title}
          </Text>
          <Text style={tw`text-[15px] text-stone-500 leading-6 text-center mt-2.5`}>{step.body}</Text>

          {step.id === 'intent' ? (
            <View style={tw`mt-5`}>
              {INTENTS.map((item) => {
                const active = intent === item.id;
                return (
                  <PressableScale
                    key={item.id}
                    feedback="select"
                    onPress={() => setIntent(item.id)}
                    style={[
                      tw`flex-row items-center rounded-2xl px-4 py-3.5 mb-2 border`,
                      active
                        ? { backgroundColor: theme.colors.brandSoft, borderColor: '#A7F3D0' }
                        : {
                            backgroundColor: theme.colors.card,
                            borderColor: 'rgba(28,25,23,0.08)',
                          },
                    ]}
                  >
                    <View
                      style={[
                        tw`w-10 h-10 rounded-full items-center justify-center mr-3`,
                        { backgroundColor: active ? theme.colors.brand : theme.colors.subtle },
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={18}
                        color={active ? '#FFFFFF' : theme.colors.brand}
                      />
                    </View>
                    <Text style={tw`flex-1 font-semibold text-stone-900`}>{item.label}</Text>
                    {active ? (
                      <Ionicons name="checkmark-circle" size={20} color={theme.colors.brand} />
                    ) : null}
                  </PressableScale>
                );
              })}
              {intentLine ? (
                <Text style={tw`text-sm text-emerald-800 text-center mt-2`}>{intentLine}</Text>
              ) : null}
            </View>
          ) : null}

          {step.id === 'create' ? (
            <View style={tw`items-center mt-5 mb-1`}>
              <View
                style={[
                  tw`w-14 h-14 rounded-full items-center justify-center`,
                  { backgroundColor: theme.colors.brand },
                ]}
              >
                <Ionicons name="add" size={30} color="#FFFFFF" />
              </View>
              <Text style={tw`text-xs font-semibold text-stone-500 mt-2`}>
                That’s the one. Bottom center.
              </Text>
            </View>
          ) : null}

          {step.details
            ? step.details.map((item) => <DetailCard key={item.title} item={item} />)
            : null}

          {step.id === 'later' ? (
            <View style={tw`mt-4`}>
              <View
                style={[
                  tw`rounded-2xl px-4 py-3.5 mb-2.5 border`,
                  { backgroundColor: theme.colors.energySoft, borderColor: '#FECACA' },
                ]}
              >
                <View style={tw`flex-row items-center mb-1`}>
                  <Ionicons name="chatbubble-ellipses" size={16} color={theme.colors.energy} />
                  <Text style={tw`ml-2 font-bold text-stone-900`}>Review Grow!</Text>
                </View>
                <Text style={tw`text-sm text-stone-600 leading-5`}>
                  You → the coral “Review Grow!” row. Or Settings → Support → Review Grow!. Stars + a
                  note. We reply there.
                </Text>
              </View>
              <View
                style={[
                  tw`rounded-2xl px-4 py-3.5 border`,
                  { backgroundColor: theme.colors.brandSoft, borderColor: '#A7F3D0' },
                ]}
              >
                <View style={tw`flex-row items-center mb-1`}>
                  <Ionicons name="sparkles" size={16} color={theme.colors.brand} />
                  <Text style={tw`ml-2 font-bold text-stone-900`}>Replay this tour</Text>
                </View>
                <Text style={tw`text-sm text-stone-600 leading-5`}>
                  Settings → Support → Replay the tour. Same walkthrough, whenever you want.
                </Text>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>

      <View style={tw`px-5 pb-4 pt-2`}>
        {isLast ? (
          <PrimaryButton label="I’m in — let’s grow" onPress={() => void finish()} />
        ) : (
          <View style={tw`flex-row items-center`}>
            {!isFirst ? (
              <PressableScale
                onPress={() => go(index - 1)}
                style={tw`w-[72px] h-[50px] rounded-2xl border border-stone-200 bg-[#FFFcf7] items-center justify-center mr-3`}
              >
                <Ionicons name="arrow-back" size={18} color="#1C1917" />
              </PressableScale>
            ) : null}
            <View style={tw`flex-1`}>
              <PrimaryButton
                label={
                  isFirst ? 'Let’s go' : step.id === 'intent' && !intent ? 'Pick one first' : 'Next'
                }
                onPress={() => go(index + 1)}
                disabled={step.id === 'intent' && !intent}
              />
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
