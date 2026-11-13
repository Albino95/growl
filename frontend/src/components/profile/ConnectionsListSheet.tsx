import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import PressableScale from '../ui/PressableScale';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw, { theme } from '../../lib/tw';
import { resolveAvatarUri, avatarSource } from '../../utils/images';
import type { FriendSummary } from '../../services/api/friends';
import type { ProfilePreview } from '../../app/navigation/RootNavigator';
import SearchField from '../ui/SearchField';

export type ConnectionsSheetMode = 'following' | 'followers';

type AccountFilter = 'all' | 'people' | 'instructor' | 'business';
type SortMode = 'recent' | 'az';

type Props = {
  visible: boolean;
  mode: ConnectionsSheetMode;
  users: FriendSummary[];
  loading?: boolean;
  onClose: () => void;
  onSelectUser: (userId: string, preview?: ProfilePreview) => void;
};

function accountTypeOf(u: FriendSummary): AccountFilter {
  if (u.is_business) return 'business';
  if (u.is_instructor) return 'instructor';
  return 'people';
}

function roleLabel(u: FriendSummary): string {
  if (u.is_business) return 'Business';
  if (u.is_instructor) return 'Instructor';
  return 'Member';
}

const FILTERS: { key: AccountFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'people', label: 'People' },
  { key: 'instructor', label: 'Instructors' },
  { key: 'business', label: 'Business' },
];

export default function ConnectionsListSheet({
  visible,
  mode,
  users,
  loading,
  onClose,
  onSelectUser,
}: Props) {
  const [query, setQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all');
  const [sort, setSort] = useState<SortMode>('recent');

  const title = mode === 'following' ? 'Following' : 'Followers';
  const subtitle =
    mode === 'following'
      ? 'People in your growth network you follow'
      : 'People following you in shared growth areas';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = users.filter((u) => {
      if (accountFilter !== 'all' && accountTypeOf(u) !== accountFilter) return false;
      if (!q) return true;
      const name = (u.username || '').toLowerCase();
      const cats = (u.categories || []).join(' ').toLowerCase();
      return name.includes(q) || cats.includes(q);
    });
    if (sort === 'az') {
      list = [...list].sort((a, b) =>
        (a.username || '').localeCompare(b.username || '', undefined, { sensitivity: 'base' })
      );
    }
    return list;
  }, [users, query, accountFilter, sort]);

  const resetAndClose = () => {
    setQuery('');
    setAccountFilter('all');
    setSort('recent');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={resetAndClose}
    >
      <SafeAreaView edges={['top', 'bottom']} style={tw`flex-1 bg-page`}>
        <View style={tw`px-gutter-wide pt-3 pb-2 border-b border-line/80 bg-card`}>
          <View style={tw`flex-row items-center justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`text-xl font-bold text-ink`}>{title}</Text>
              <Text style={tw`text-sm text-ink-3 mt-0.5`}>{subtitle}</Text>
            </View>
            <PressableScale
              onPress={resetAndClose}
              hitSlop={12}
              style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
              pressedScale={0.9}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={theme.colors.ink2} />
            </PressableScale>
          </View>

          <View style={tw`mt-3`}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${title.toLowerCase()}…`}
              onSubmit={() => undefined}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={tw`mb-2`}
            contentContainerStyle={tw`pr-2`}
          >
            {FILTERS.map((f) => {
              const selected = accountFilter === f.key;
              return (
                <PressableScale
                  key={f.key}
                  onPress={() => setAccountFilter(f.key)}
                  style={tw`mr-2 px-3.5 py-2 rounded-card border ${
                    selected ? 'bg-emerald-600 border-emerald-600' : 'bg-card border-line'
                  }`}
                >
                  <Text
                    style={tw`text-sm font-semibold ${selected ? 'text-white' : 'text-stone-800'}`}
                  >
                    {f.label}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>

          <View style={tw`flex-row items-center justify-between mb-1`}>
            <Text style={tw`text-xs text-emerald-700 font-medium`}>
              {filtered.length} of {users.length}{' '}
              {filtered.length === 1 ? 'person' : 'people'}
            </Text>
            <PressableScale
              onPress={() => setSort((s) => (s === 'recent' ? 'az' : 'recent'))}
              style={tw`flex-row items-center px-2.5 py-1.5 rounded-chip bg-raised`}
            >
              <Ionicons
                name={sort === 'az' ? 'text-outline' : 'time-outline'}
                size={14}
                color="#059669"
              />
              <Text style={tw`text-xs font-semibold text-emerald-800 ml-1`}>
                {sort === 'az' ? 'A–Z' : 'Recent'}
              </Text>
            </PressableScale>
          </View>
        </View>

        {loading ? (
          <View style={tw`py-16 items-center`}>
            <ActivityIndicator size="large" color="#059669" />
          </View>
        ) : users.length === 0 ? (
          <View style={tw`py-16 px-8 items-center`}>
            <Ionicons name="people-outline" size={48} color={theme.colors.iconMuted} />
            <Text style={tw`text-ink-2 text-center mt-4 leading-5`}>
              {mode === 'following'
                ? 'No connections yet. Pick growth categories to auto-link with others in the same areas.'
                : 'No followers yet. When others share your growth categories, they connect with you.'}
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={tw`py-16 px-8 items-center`}>
            <Ionicons name="search-outline" size={40} color={theme.colors.iconMuted} />
            <Text style={tw`text-ink-2 text-center mt-4 leading-5`}>
              No matches{query.trim() ? ` for “${query.trim()}”` : ''}. Try another filter or clear
              search.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={tw`pb-6`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <PressableScale
                onPress={() => onSelectUser(item.id, { username: item.username, avatarUrl: item.avatar })}
                style={tw`flex-row items-center px-gutter-wide py-3.5 border-b border-line bg-card`}
              >
                <View
                  style={tw`w-12 h-12 rounded-full overflow-hidden bg-emerald-50 mr-3 border border-line/70`}
                >
                  <Image
                    source={avatarSource(resolveAvatarUri(item.id, item.username, item.avatar))}
                    style={tw`w-full h-full`}
                    contentFit="cover"
                  />
                </View>
                <View style={tw`flex-1`}>
                  <Text style={tw`text-base font-semibold text-ink`}>{item.username}</Text>
                  <Text style={tw`text-xs text-ink-3 mt-0.5`}>{roleLabel(item)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.iconMuted} />
              </PressableScale>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}
