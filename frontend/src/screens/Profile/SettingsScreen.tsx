import React from 'react';
import { View, Text, ScrollView, Switch, Pressable } from 'react-native';
import PressableScale from '../../components/ui/PressableScale';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import { haptic } from '../../theme/haptics';
import { previewSound } from '../../utils/interactionFeedback';
import { getRootNavigator, navigateFromRoot } from '../../app/navigation/rootNavigation';
import { useUiPrefsStore, type AppearancePref } from '../../state/useUiPrefsStore';
import { DARK_MODE_READY } from '../../theme/appearance';
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import { useAuth } from '../../store/hooks';
import { useDemoTutorialStore } from '../../state/useDemoTutorialStore';

function Row({
  icon,
  label,
  subtitle,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      style={tw`flex-row items-center py-3.5 border-b border-line/80`}
    >
      <View
        style={tw`w-9 h-9 rounded-full items-center justify-center mr-3 ${
          danger ? 'bg-red-50' : 'bg-raised'
        }`}
      >
        <Ionicons name={icon} size={18} color={danger ? theme.colors.danger : '#059669'} />
      </View>
      <View style={tw`flex-1 pr-2`}>
        <Text style={tw`font-semibold ${danger ? 'text-red-700' : 'text-ink'}`}>{label}</Text>
        {subtitle ? <Text style={tw`text-xs text-ink-3 mt-0.5`}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.iconMuted} />
    </PressableScale>
  );
}

const APPEARANCE_OPTIONS: { value: AppearancePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** System / Light / Dark segmented control. Hidden until DARK_MODE_READY. */
function AppearanceRow() {
  const appearance = useUiPrefsStore((s) => s.appearance);
  const setAppearance = useUiPrefsStore((s) => s.setAppearance);
  return (
    <View style={tw`py-3.5 border-t border-line`}>
      <Text style={tw`font-semibold text-ink`}>Appearance</Text>
      <Text style={tw`text-xs text-ink-3 mt-0.5 mb-2.5`}>
        System follows your phone's light or dark setting.
      </Text>
      <View accessibilityRole="radiogroup" style={tw`flex-row bg-raised rounded-control p-1`}>
        {APPEARANCE_OPTIONS.map((opt) => {
          const selected = appearance === opt.value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Appearance: ${opt.label}`}
              onPress={() => {
                if (selected) return;
                haptic('selection');
                // Switching remounts the app tree (see App.tsx) — instant.
                setAppearance(opt.value);
              }}
              style={tw`flex-1 items-center py-2 rounded-[9px] ${selected ? 'bg-card' : ''}`}
            >
              <Text
                style={tw`text-footnote ${selected ? 'font-semibold text-ink' : 'text-ink-2'}`}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const replayTutorial = useDemoTutorialStore((s) => s.replay);
  const hapticsEnabled = useUiPrefsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useUiPrefsStore((s) => s.setHapticsEnabled);
  const soundEnabled = useUiPrefsStore((s) => s.soundEnabled);
  const setSoundEnabled = useUiPrefsStore((s) => s.setSoundEnabled);

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <PressableScale
            onPress={() => navigation.goBack()}
            pressedScale={0.9}
            hitSlop={8}
            style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={18} color={theme.colors.ink} />
          </PressableScale>
        }
      />

      <ScrollView
        contentContainerStyle={[tw`px-gutter-wide pt-4`, { paddingBottom: TAB_SCREEN_BOTTOM_PADDING }]}
      >
        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`}>
          Account
        </Text>
        <Text style={tw`text-2xl font-bold text-ink mt-0.5 mb-4`}>Settings</Text>

        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
          Profile
        </Text>
        <View style={tw`bg-card border border-line/80 rounded-card px-4 mb-5`}>
          <Row
            icon="person-outline"
            label="Edit profile"
            subtitle="Name, avatar, bio"
            onPress={() => navigateFromRoot(navigation, 'EditProfile')}
          />
          <Row
            icon="notifications-outline"
            label="Notifications"
            subtitle="Push and email preferences"
            onPress={() => navigateFromRoot(navigation, 'NotificationPrefs')}
          />
          <Row
            icon="gift-outline"
            label="Invite friends"
            subtitle="Share your code and grow together"
            onPress={() => navigateFromRoot(navigation, 'Invite')}
          />
        </View>

        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
          Feedback
        </Text>
        <View style={tw`bg-card border border-line/80 rounded-card px-4 mb-5`}>
          <View style={tw`flex-row items-center justify-between py-3.5 border-b border-line/80`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`font-semibold text-ink`}>Sounds</Text>
              <Text style={tw`text-xs text-ink-3 mt-0.5`}>
                Gentle chimes for check-ins, milestones and sharing. Follows your silent switch.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Sounds"
              value={soundEnabled}
              onValueChange={(v) => {
                haptic('selection');
                setSoundEnabled(v);
                // Turning sounds on previews the check-in chime.
                if (v) previewSound('bloom');
              }}
              trackColor={{ false: tw.color('stone-300'), true: tw.color('emerald-200') }}
              thumbColor={soundEnabled ? '#059669' : '#F5F5F4'}
            />
          </View>
          <View style={tw`flex-row items-center justify-between py-3.5`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`font-semibold text-ink`}>Haptics</Text>
              <Text style={tw`text-xs text-ink-3 mt-0.5`}>Subtle taps you can feel.</Text>
            </View>
            <Switch
              accessibilityLabel="Haptics"
              value={hapticsEnabled}
              onValueChange={(v) => {
                setHapticsEnabled(v);
                // Confirm "on" with the tick itself; turning haptics off stays silent.
                if (v) haptic('selection');
              }}
              trackColor={{ false: tw.color('stone-300'), true: tw.color('emerald-200') }}
              thumbColor={hapticsEnabled ? '#059669' : '#F5F5F4'}
            />
          </View>
          {DARK_MODE_READY ? <AppearanceRow /> : null}
        </View>

        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
          Teaching
        </Text>
        <View style={tw`bg-card border border-line/80 rounded-card px-4 mb-5`}>
          <Row
            icon="search-outline"
            label="Find instructors"
            subtitle="Browse coaches and reach out"
            onPress={() => navigateFromRoot(navigation, 'Instructors')}
          />
          <Row
            icon="school-outline"
            label="Instructor Hub"
            subtitle={
              user?.isInstructor
                ? 'Students, offer, homework, partnerships'
                : 'Earn peer endorsements, then claim instructor status'
            }
            onPress={() =>
              getRootNavigator(navigation)?.navigate('Individual', { screen: 'Instructor' })
            }
          />
        </View>

        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
          Commerce
        </Text>
        <View style={tw`bg-card border border-line/80 rounded-card px-4 mb-5`}>
          <Row
            icon="storefront-outline"
            label="Shop"
            onPress={() => {
              navigation.goBack();
              setTimeout(() => {
                try {
                  (navigation as any).navigate('Marketplace');
                } catch {
                  /* ignore */
                }
              }, 0);
            }}
          />
          <Row
            icon="receipt-outline"
            label="My orders"
            onPress={() => navigateFromRoot(navigation, 'UserOrders')}
          />
        </View>

        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
          Support
        </Text>
        <View style={tw`bg-card border border-line/80 rounded-card px-4 mb-5`}>
          <Row
            icon="chatbubble-ellipses-outline"
            label="Review Grow!"
            subtitle="Tell us what’s broken — we reply here"
            onPress={() => navigateFromRoot(navigation, 'AppReviews')}
          />
          <Row
            icon="sparkles-outline"
            label="Replay the tour"
            subtitle="The first-launch walkthrough"
            onPress={() => {
              replayTutorial();
              navigation.goBack();
            }}
          />
          <Row
            icon="document-text-outline"
            label="Legal & support"
            onPress={() => navigateFromRoot(navigation, 'Legal')}
          />
          <Row
            icon="trash-outline"
            label="Delete account"
            danger
            onPress={() => navigateFromRoot(navigation, 'DeleteAccount')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
