import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';
import ScreenHeader from '../../components/ui/ScreenHeader';
import GrowAvatar from '../../components/ui/GrowAvatar';
import Skeleton from '../../components/ui/Skeleton';
import ErrorState from '../../components/ui/ErrorState';
import { haptic } from '../../theme/haptics';
import { toast } from '../../state/useToastStore';
import { confirmAsync } from '../../utils/confirmDialog';
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import { unblockUser } from '../../services/api/friends';
import {
  getPrivacy,
  listBlockedUsers,
  setPrivacy,
  whenAvailable,
  type BlockedUser,
  type DmPolicy,
} from '../../services/api/privacy';
import { useAccountExport } from './useAccountExport';

/** Section load state. `hidden` = the endpoint isn't deployed yet, so the section is left out. */
type Load<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'hidden' }
  | { status: 'error' };

const DM_OPTIONS: { value: DmPolicy; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'friends', label: 'Friends' },
  { value: 'nobody', label: 'Nobody' },
];

const DM_HINT: Record<DmPolicy, string> = {
  everyone: 'Anyone on Grow! can start a chat with you.',
  friends: 'Only your friends can start a chat with you.',
  nobody: 'No one can start a new chat with you. Existing chats stay.',
};

function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
      {children}
    </Text>
  );
}

function DmPolicySection({
  value,
  onChange,
}: {
  value: DmPolicy;
  onChange: (next: DmPolicy) => void;
}) {
  return (
    <View style={tw`bg-card border border-line/80 rounded-card px-4 py-3.5 mb-5`}>
      <Text style={tw`font-semibold text-ink`}>Who can message you</Text>
      <Text style={tw`text-xs text-ink-3 mt-0.5 mb-2.5`}>{DM_HINT[value]}</Text>
      <View accessibilityRole="radiogroup" style={tw`flex-row bg-raised rounded-control p-1`}>
        {DM_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Who can message you: ${opt.label}`}
              onPress={() => {
                if (!selected) onChange(opt.value);
              }}
              style={tw`flex-1 items-center py-2 rounded-[9px] ${selected ? 'bg-card' : ''}`}
            >
              <Text style={tw`text-footnote ${selected ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function BlockedSkeleton() {
  return (
    <View>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={tw`flex-row items-center py-3 ${i < 2 ? 'border-b border-line/80' : ''}`}
        >
          <Skeleton style={tw`w-10 h-10 rounded-full mr-3`} />
          <View style={tw`flex-1`}>
            <Skeleton style={tw`h-3.5 w-32 rounded-chip mb-1.5`} />
            <Skeleton style={tw`h-3 w-20 rounded-chip`} />
          </View>
        </View>
      ))}
    </View>
  );
}

function BlockedRow({
  user,
  last,
  busy,
  onUnblock,
}: {
  user: BlockedUser;
  last: boolean;
  busy: boolean;
  onUnblock: () => void;
}) {
  const name = user.display_name?.trim() || user.username;
  return (
    <View style={tw`flex-row items-center py-3 ${last ? '' : 'border-b border-line/80'}`}>
      <GrowAvatar
        userId={user.id}
        username={user.username}
        uri={user.avatar_url}
        size={40}
        style={tw`mr-3`}
      />
      <View style={tw`flex-1 pr-2`}>
        <Text style={tw`font-semibold text-ink`} numberOfLines={1}>
          {name}
        </Text>
        {user.username && name !== user.username ? (
          <Text style={tw`text-xs text-ink-3 mt-0.5`} numberOfLines={1}>
            @{user.username}
          </Text>
        ) : null}
      </View>
      <PressableScale
        onPress={onUnblock}
        disabled={busy}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Unblock ${name}`}
        style={tw`px-3.5 py-2 rounded-chip bg-raised border border-line/80 min-w-[84px] items-center`}
      >
        {busy ? (
          <ActivityIndicator size="small" color={theme.colors.brand} />
        ) : (
          <Text style={tw`text-footnote font-semibold text-ink`}>Unblock</Text>
        )}
      </PressableScale>
    </View>
  );
}

export default function PrivacyScreen() {
  const navigation = useNavigation();
  const { exporting, runExport } = useAccountExport();

  const [dm, setDm] = useState<Load<DmPolicy>>({ status: 'loading' });
  const [blocked, setBlocked] = useState<Load<BlockedUser[]>>({ status: 'loading' });
  const [unblocking, setUnblocking] = useState<string | null>(null);
  /** Latest DM save wins — older responses must not overwrite a newer pick. */
  const dmSaveSeq = useRef(0);

  const loadDm = useCallback(async () => {
    setDm({ status: 'loading' });
    try {
      const r = await whenAvailable(getPrivacy);
      setDm(r.available ? { status: 'ready', data: r.data.dm_policy } : { status: 'hidden' });
    } catch {
      setDm({ status: 'error' });
    }
  }, []);

  const loadBlocked = useCallback(async () => {
    setBlocked({ status: 'loading' });
    try {
      const r = await whenAvailable(listBlockedUsers);
      setBlocked(r.available ? { status: 'ready', data: r.data } : { status: 'hidden' });
    } catch {
      setBlocked({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void loadDm();
    void loadBlocked();
  }, [loadDm, loadBlocked]);

  const changeDm = async (next: DmPolicy) => {
    if (dm.status !== 'ready') return;
    const previous = dm.data;
    const seq = ++dmSaveSeq.current;
    haptic('chip');
    setDm({ status: 'ready', data: next });
    try {
      await setPrivacy({ dm_policy: next });
      if (seq !== dmSaveSeq.current) return;
      toast.success('Saved');
    } catch {
      if (seq !== dmSaveSeq.current) return;
      haptic('error');
      setDm({ status: 'ready', data: previous });
      toast.info('Couldn’t save that — try again', { icon: 'cloud-offline-outline' });
    }
  };

  const confirmUnblock = async (user: BlockedUser) => {
    const name = user.display_name?.trim() || user.username;
    const ok = await confirmAsync(
      `Unblock ${name}?`,
      'They’ll be able to see your posts and message you again. We won’t tell them.',
      { confirmLabel: 'Unblock' },
    );
    if (!ok) return;
    setUnblocking(user.id);
    try {
      await unblockUser(user.id);
      haptic('commit');
      setBlocked((prev) =>
        prev.status === 'ready'
          ? { status: 'ready', data: prev.data.filter((u) => u.id !== user.id) }
          : prev,
      );
      toast.success(`${name} is unblocked`);
    } catch {
      haptic('error');
      toast.info('Couldn’t unblock — try again', { icon: 'cloud-offline-outline' });
    } finally {
      setUnblocking(null);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      <ScreenHeader
        title="Privacy & safety"
        backIcon="arrow-back"
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={[
          tw`px-gutter-wide pt-4`,
          { paddingBottom: TAB_SCREEN_BOTTOM_PADDING },
        ]}
      >
        {dm.status !== 'hidden' ? (
          <>
            <SectionTitle>Messages</SectionTitle>
            {dm.status === 'ready' ? (
              <DmPolicySection value={dm.data} onChange={(v) => void changeDm(v)} />
            ) : dm.status === 'loading' ? (
              <View style={tw`bg-card border border-line/80 rounded-card px-4 py-3.5 mb-5`}>
                <Skeleton style={tw`h-4 w-40 rounded-chip mb-2`} />
                <Skeleton style={tw`h-3 w-56 rounded-chip mb-3`} />
                <Skeleton style={tw`h-10 w-full rounded-control`} />
              </View>
            ) : (
              <View style={tw`bg-card border border-line/80 rounded-card mb-5`}>
                <ErrorState compact onRetry={() => void loadDm()} />
              </View>
            )}
          </>
        ) : null}

        {blocked.status !== 'hidden' ? (
          <>
            <SectionTitle>Blocked people</SectionTitle>
            <View style={tw`bg-card border border-line/80 rounded-card px-4 mb-5`}>
              {blocked.status === 'loading' ? (
                <BlockedSkeleton />
              ) : blocked.status === 'error' ? (
                <ErrorState compact onRetry={() => void loadBlocked()} />
              ) : blocked.data.length === 0 ? (
                <Text style={tw`text-body text-ink-2 py-4`}>You haven’t blocked anyone.</Text>
              ) : (
                blocked.data.map((u, i) => (
                  <BlockedRow
                    key={u.id}
                    user={u}
                    last={i === blocked.data.length - 1}
                    busy={unblocking === u.id}
                    onUnblock={() => void confirmUnblock(u)}
                  />
                ))
              )}
            </View>
          </>
        ) : null}

        <SectionTitle>Your data</SectionTitle>
        <View style={tw`bg-card border border-line/80 rounded-card px-4 mb-5`}>
          <PressableScale
            onPress={() => void runExport()}
            disabled={exporting}
            accessibilityRole="button"
            accessibilityLabel="Export my data"
            style={tw`flex-row items-center py-3.5`}
          >
            <View style={tw`w-9 h-9 rounded-full items-center justify-center mr-3 bg-raised`}>
              <Ionicons name="download-outline" size={18} color={theme.colors.brand} />
            </View>
            <View style={tw`flex-1 pr-2`}>
              <Text style={tw`font-semibold text-ink`}>Export my data</Text>
              <Text style={tw`text-xs text-ink-3 mt-0.5`}>
                A copy of your profile, posts, comments and orders
              </Text>
            </View>
            {exporting ? (
              <ActivityIndicator size="small" color={theme.colors.brand} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={theme.colors.iconMuted} />
            )}
          </PressableScale>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
