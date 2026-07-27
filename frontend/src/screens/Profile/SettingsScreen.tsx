import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { useUiPrefsStore } from '../../state/useUiPrefsStore';
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';

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
    <TouchableOpacity
      onPress={onPress}
      style={tw`flex-row items-center py-3.5 border-b border-stone-200/80`}
    >
      <View
        style={tw`w-9 h-9 rounded-full items-center justify-center mr-3 ${
          danger ? 'bg-red-50' : 'bg-stone-100'
        }`}
      >
        <Ionicons name={icon} size={18} color={danger ? '#DC2626' : '#57534E'} />
      </View>
      <View style={tw`flex-1 pr-2`}>
        <Text style={tw`font-semibold ${danger ? 'text-red-700' : 'text-stone-900'}`}>{label}</Text>
        {subtitle ? <Text style={tw`text-xs text-stone-500 mt-0.5`}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation();
  const hapticsEnabled = useUiPrefsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useUiPrefsStore((s) => s.setHapticsEnabled);
  const soundEnabled = useUiPrefsStore((s) => s.soundEnabled);
  const setSoundEnabled = useUiPrefsStore((s) => s.setSoundEnabled);

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <Pressable
            onPress={() => navigation.goBack()}
            style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={18} color="#1C1917" />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={[tw`px-5 pt-4`, { paddingBottom: TAB_SCREEN_BOTTOM_PADDING }]}
      >
        <Text style={tw`text-lg font-bold text-stone-900 mb-4`}>Settings</Text>

        <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
          Account
        </Text>
        <View style={tw`bg-white/80 border border-stone-200/80 rounded-2xl px-4 mb-5`}>
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
        </View>

        <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
          Preferences
        </Text>
        <View style={tw`bg-white/80 border border-stone-200/80 rounded-2xl px-4 mb-5`}>
          <View style={tw`flex-row items-center justify-between py-3.5 border-b border-stone-200/80`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`font-semibold text-stone-900`}>Haptics</Text>
              <Text style={tw`text-xs text-stone-500 mt-0.5`}>Vibration on presses (mobile)</Text>
            </View>
            <Switch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              trackColor={{ false: '#D6D3D1', true: '#A7F3D0' }}
              thumbColor={hapticsEnabled ? '#059669' : '#F5F5F4'}
            />
          </View>
          <View style={tw`flex-row items-center justify-between py-3.5`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`font-semibold text-stone-900`}>Click sound</Text>
              <Text style={tw`text-xs text-stone-500 mt-0.5`}>Optional tone where supported</Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ false: '#D6D3D1', true: '#A7F3D0' }}
              thumbColor={soundEnabled ? '#059669' : '#F5F5F4'}
            />
          </View>
        </View>

        <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
          Commerce
        </Text>
        <View style={tw`bg-white/80 border border-stone-200/80 rounded-2xl px-4 mb-5`}>
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

        <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
          Support
        </Text>
        <View style={tw`bg-white/80 border border-stone-200/80 rounded-2xl px-4 mb-5`}>
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
