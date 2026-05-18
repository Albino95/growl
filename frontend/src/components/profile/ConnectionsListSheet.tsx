import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from '../../lib/tw';
import { resolveAvatarUri } from '../../utils/images';
import type { FriendSummary } from '../../services/api/friends';

export type ConnectionsSheetMode = 'following' | 'followers';

type Props = {
  visible: boolean;
  mode: ConnectionsSheetMode;
  users: FriendSummary[];
  loading?: boolean;
  onClose: () => void;
  onSelectUser: (userId: string) => void;
};

export default function ConnectionsListSheet({
  visible,
  mode,
  users,
  loading,
  onClose,
  onSelectUser,
}: Props) {
  const title = mode === 'following' ? 'Following' : 'Followers';
  const subtitle =
    mode === 'following'
      ? 'People in your growth network you follow'
      : 'People following you in shared growth areas';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={tw`flex-1 justify-end bg-black/40`}>
        <SafeAreaView edges={['bottom']} style={tw`bg-white rounded-t-3xl max-h-[85%]`}>
          <View style={tw`px-5 pt-3 pb-2 border-b border-stone-100`}>
            <View style={tw`w-10 h-1 bg-stone-200 rounded-full self-center mb-4`} />
            <View style={tw`flex-row items-center justify-between`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={tw`text-xl font-bold text-stone-900`}>{title}</Text>
                <Text style={tw`text-sm text-stone-500 mt-0.5`}>{subtitle}</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={12}
                style={tw`w-9 h-9 rounded-full bg-stone-100 items-center justify-center`}
              >
                <Ionicons name="close" size={22} color="#57534E" />
              </TouchableOpacity>
            </View>
            <Text style={tw`text-xs text-emerald-700 font-medium mt-2`}>
              {users.length} {users.length === 1 ? 'person' : 'people'}
            </Text>
          </View>

          {loading ? (
            <View style={tw`py-16 items-center`}>
              <ActivityIndicator size="large" color="#059669" />
            </View>
          ) : users.length === 0 ? (
            <View style={tw`py-16 px-8 items-center`}>
              <Ionicons name="people-outline" size={48} color="#D6D3D1" />
              <Text style={tw`text-stone-600 text-center mt-4 leading-5`}>
                {mode === 'following'
                  ? 'No connections yet. Pick growth categories to auto-link with others in the same areas.'
                  : 'No followers yet. When others share your growth categories, they connect with you.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={users}
              keyExtractor={(item) => item.id}
              contentContainerStyle={tw`pb-6`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => onSelectUser(item.id)}
                  style={tw`flex-row items-center px-5 py-3.5 border-b border-stone-50 active:bg-stone-50`}
                >
                  <View style={tw`w-12 h-12 rounded-full overflow-hidden bg-emerald-50 mr-3`}>
                    <Image
                      source={{ uri: resolveAvatarUri(item.id, item.username, item.avatar) }}
                      style={tw`w-full h-full`}
                      contentFit="cover"
                    />
                  </View>
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-base font-semibold text-stone-900`}>{item.username}</Text>
                    <Text style={tw`text-xs text-stone-500 mt-0.5`}>View profile</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#A8A29E" />
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}
