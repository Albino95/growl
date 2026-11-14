import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import FadeInUp from '../ui/FadeInUp';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import { addFriend, listFriends } from '../../services/api/friends';
import { getFeedPosts } from '../../services/api/feed';
import { rankDiscoverPeople } from '../../utils/ranking';
import { useAuth } from '../../store/hooks';
import { toast } from '../../state/useToastStore';
import { haptic } from '../../theme/haptics';
import { alertMessage } from '../../utils/confirmDialog';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { horizontalScrollProps } from '../../constants/scroll';
import type { ProfilePreview } from '../../app/navigation/RootNavigator';

type Props = {
  filtered: boolean;
  categoryLabel?: string;
  failed: boolean;
  hasPaths: boolean;
  onExplore: () => void;
  onJournal: () => void;
  onClearFilter?: () => void;
  onChoosePaths: () => void;
  onOpenProfile: (userId: string, preview?: ProfilePreview) => void;
  onInstructors: () => void;
  /** Opens the Invite screen. */
  onInvite?: () => void;
  /** Called after an Add lands; `connected` = they had already asked, now friends. */
  onFriendAdded?: (connected: boolean) => void;
};

type FriendState = 'none' | 'requested' | 'friends';

type PathPerson = {
  id: string;
  username: string;
  avatar?: string | null;
  label: string;
  state: FriendState;
};

const MAX_PEOPLE = 12;

/**
 * First-session Home — never a blank Instagram empty.
 * Path people, today's journal, and a way to meet instructors.
 */
export default function HomeEmptyCanvas({
  filtered,
  categoryLabel,
  failed,
  hasPaths,
  onExplore,
  onJournal,
  onClearFilter,
  onChoosePaths,
  onOpenProfile,
  onInstructors,
  onInvite,
  onFriendAdded,
}: Props) {
  const { user } = useAuth();
  const [people, setPeople] = useState<PathPerson[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inFlight = useRef(new Set<string>());
  const userPaths = user?.categories ?? [];
  const pathsKey = userPaths.join(',');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // allSettled: suggestions failing must not hide friends (and vice versa).
      const [friendsS, postsS] = await Promise.allSettled([
        listFriends(),
        getFeedPosts({ mode: 'explore' }),
      ]);
      if (cancelled) return;
      const friends = friendsS.status === 'fulfilled' ? friendsS.value : [];
      const posts =
        postsS.status === 'fulfilled' && postsS.value?.success && Array.isArray(postsS.value.data)
          ? postsS.value.data
          : [];
      const friendIds = new Set(friends.map((f) => f.id));
      let suggested: PathPerson[] = [];
      try {
        suggested = rankDiscoverPeople([], posts, userPaths, { selfId: user?.id, friendIds }).map(
          (p) => ({
            id: p.userId,
            username: p.username,
            avatar: p.avatar,
            label: p.latestPost?.category ? getCategoryLabel(p.latestPost.category) : 'Growing',
            state: 'none' as const,
          })
        );
      } catch {
        suggested = [];
      }
      const friendCards: PathPerson[] = friends.map((f) => ({
        id: f.id,
        username: f.username,
        avatar: f.avatar,
        label: f.categories?.[0]
          ? getCategoryLabel(f.categories[0])
          : f.is_instructor
            ? 'Instructor'
            : 'Growing',
        state: 'friends' as const,
      }));
      // New faces first — that is where the Add button earns its place.
      setPeople([...suggested, ...friendCards].slice(0, MAX_PEOPLE));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paths key covers userPaths
  }, [user?.id, pathsKey]);

  const setPersonState = (id: string, state: FriendState) =>
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, state } : p)));

  const onAdd = async (person: PathPerson) => {
    if (person.state !== 'none' || inFlight.current.has(person.id)) return;
    inFlight.current.add(person.id);
    haptic('commit');
    // Optimistic: flip to Requested right away; the server may upgrade it to Friends.
    setPersonState(person.id, 'requested');
    try {
      const result = await addFriend(person.id);
      if (result.connected) {
        haptic('success');
        setPersonState(person.id, 'friends');
        toast.success(`You and ${person.username} are friends`);
      } else {
        toast.success('Friend request sent');
      }
      onFriendAdded?.(result.connected);
    } catch (e) {
      setPersonState(person.id, 'none');
      haptic('error');
      void alertMessage('Could not add', e instanceof Error ? e.message : 'Try again in a moment.');
    } finally {
      inFlight.current.delete(person.id);
    }
  };

  if (filtered) {
    return (
      <FadeInUp style={tw`px-gutter-wide pt-6 pb-4`}>
        <View style={tw`rounded-card bg-card border border-line/80 px-5 py-6`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase`}>
            Path home
          </Text>
          <Text style={tw`text-lg font-bold text-ink mt-1`}>
            Quiet on {categoryLabel || 'this path'}
          </Text>
          <Text style={tw`text-sm text-ink-3 mt-1.5 leading-5`}>
            Posts from other paths stay under All. Write a note, or clear the filter.
          </Text>
          <View style={tw`flex-row gap-2 mt-4`}>
            <PressableScale
              onPress={onJournal}
              style={tw`flex-1 py-2.5 rounded-control bg-emerald-600 items-center`}
            >
              <Text style={tw`text-white font-bold text-sm`}>Today’s note</Text>
            </PressableScale>
            {onClearFilter ? (
              <PressableScale
                onPress={onClearFilter}
                style={tw`px-3.5 py-2.5 rounded-control border border-line bg-card items-center`}
              >
                <Text style={tw`text-ink-2 font-semibold text-sm`}>All</Text>
              </PressableScale>
            ) : null}
          </View>
        </View>
      </FadeInUp>
    );
  }

  if (failed) {
    return (
      <FadeInUp style={tw`px-gutter-wide pt-6 pb-4`}>
        <View style={tw`rounded-card bg-card border border-red-200 px-5 py-6`}>
          <Text style={tw`text-lg font-bold text-ink`}>Couldn’t grow the feed</Text>
          <Text style={tw`text-sm text-ink-3 mt-1.5 leading-5`}>
            Pull down to try again. Your journal still works offline-first on this device.
          </Text>
          <PressableScale
            onPress={onJournal}
            style={tw`mt-4 py-2.5 rounded-control bg-emerald-600 items-center`}
          >
            <Text style={tw`text-white font-bold text-sm`}>Write today’s note</Text>
          </PressableScale>
        </View>
      </FadeInUp>
    );
  }

  return (
    <FadeInUp style={tw`px-gutter-wide pt-4 pb-6`}>
      <View style={tw`rounded-card bg-card border border-line/80 px-5 py-5`}>
        <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase`}>
          Start growing
        </Text>
        <Text style={tw`text-title font-bold text-ink mt-1`}>Your garden is new</Text>
        <Text style={tw`text-sm text-ink-3 mt-1.5 leading-5`}>
          Home fills with people on your paths. Until then, a private note is the first seed.
        </Text>

        <PressableScale
          onPress={onJournal}
          style={tw`mt-4 py-3 rounded-card bg-emerald-600 items-center flex-row justify-center gap-2`}
        >
          <Ionicons name="book-outline" size={16} color="#FFFFFF" />
          <Text style={tw`text-white font-bold text-body`}>Write today’s journal</Text>
        </PressableScale>

        {!hasPaths ? (
          <PressableScale
            onPress={onChoosePaths}
            style={tw`mt-2 py-3 rounded-card border border-line bg-card items-center`}
          >
            <Text style={tw`text-ink font-semibold text-sm`}>Pick your growth paths</Text>
          </PressableScale>
        ) : null}
      </View>

      {hasPaths ? (
        <View style={tw`mt-4 min-h-[96px]`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
            People on your paths
          </Text>
          {!loaded ? (
            <View style={tw`flex-row`}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={tw`w-[92px] mr-2.5 items-center`}>
                  <View style={tw`w-14 h-14 rounded-full bg-raised`} />
                  <View style={tw`w-14 h-2.5 rounded-full bg-raised mt-2`} />
                </View>
              ))}
            </View>
          ) : people.length > 0 ? (
            <ScrollView horizontal {...horizontalScrollProps}>
              {people.map((person) => (
                <View
                  key={person.id}
                  style={tw`w-[104px] mr-2.5 items-center rounded-card bg-card border border-line/80 px-2 pt-3 pb-2.5`}
                >
                  <PressableScale
                    onPress={() =>
                      onOpenProfile(person.id, { username: person.username, avatarUrl: person.avatar })
                    }
                    style={tw`items-center w-full`}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${person.username}'s profile`}
                  >
                    <GrowAvatar
                      userId={person.id}
                      username={person.username}
                      uri={person.avatar}
                      size={52}
                    />
                    <Text numberOfLines={1} style={tw`text-xs font-semibold text-ink mt-1.5`}>
                      {person.username}
                    </Text>
                    <Text numberOfLines={1} style={tw`text-caption font-medium text-ink-3 mt-0.5`}>
                      {person.label}
                    </Text>
                  </PressableScale>
                  <AddButton
                    state={person.state}
                    username={person.username}
                    onPress={() => void onAdd(person)}
                  />
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={tw`text-sm text-ink-3 leading-5`}>
              No one here yet. Explore is where you meet people on your paths.
            </Text>
          )}
        </View>
      ) : null}

      {onInvite ? (
        <PressableScale
          onPress={onInvite}
          feedback="open"
          style={tw`mt-4 flex-row items-center rounded-card bg-card border border-line/80 px-4 py-3.5`}
          accessibilityRole="button"
          accessibilityLabel="Invite a friend"
        >
          <View
            style={[
              tw`w-9 h-9 rounded-full items-center justify-center mr-3`,
              { backgroundColor: theme.colors.brandSoft },
            ]}
          >
            <Ionicons name="person-add-outline" size={16} color={theme.colors.brand} />
          </View>
          <View style={tw`flex-1`}>
            <Text style={tw`text-body font-semibold text-ink`}>Invite a friend</Text>
            <Text style={tw`text-footnote text-ink-3`}>Growing is easier with someone you know.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.ink3} />
        </PressableScale>
      ) : null}

      <View style={tw`flex-row gap-2 mt-2`}>
        <PressableScale
          onPress={onExplore}
          style={tw`flex-1 py-3 rounded-card bg-card border border-line/80 items-center`}
        >
          <Text style={tw`text-ink font-semibold text-sm`}>Explore people</Text>
        </PressableScale>
        <PressableScale
          onPress={onInstructors}
          style={tw`flex-1 py-3 rounded-card bg-card border border-line/80 items-center`}
        >
          <Text style={tw`text-ink font-semibold text-sm`}>Find instructors</Text>
        </PressableScale>
      </View>
    </FadeInUp>
  );
}

function AddButton({
  state,
  username,
  onPress,
}: {
  state: FriendState;
  username: string;
  onPress: () => void;
}) {
  if (state === 'friends') {
    return (
      <View
        style={tw`mt-2 w-full flex-row items-center justify-center py-1.5 rounded-chip bg-raised`}
        accessible
        accessibilityLabel={`You and ${username} are friends`}
      >
        <Ionicons name="checkmark" size={13} color={theme.colors.brand} />
        <Text style={tw`ml-1 text-caption font-semibold text-ink-2`}>Friends</Text>
      </View>
    );
  }
  if (state === 'requested') {
    return (
      <View
        style={tw`mt-2 w-full items-center py-1.5 rounded-chip border border-line`}
        accessible
        accessibilityLabel={`Friend request sent to ${username}`}
      >
        <Text style={tw`text-caption font-semibold text-ink-3`}>Requested</Text>
      </View>
    );
  }
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.92}
      hitSlop={6}
      style={tw`mt-2 w-full flex-row items-center justify-center py-1.5 rounded-chip bg-brand-600`}
      accessibilityRole="button"
      accessibilityLabel={`Add ${username} as a friend`}
    >
      <Ionicons name="person-add" size={12} color="#FFFFFF" />
      <Text style={tw`ml-1 text-caption font-semibold text-white`}>Add</Text>
    </PressableScale>
  );
}
