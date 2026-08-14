import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { useAuth } from '../../store/hooks';
import { fetchCurrentProfile, updateProfileOnServer } from '../../services/api/profile';
import { resolveAvatarUri } from '../../utils/images';

const FETCH_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Request timed out')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { user, refreshProfile, updateUser } = useAuth();

  const fallbackUsername = user?.username || user?.email?.split('@')[0] || '';
  const [username, setUsername] = useState(fallbackUsername);
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [status, setStatus] = useState(user?.status || '');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(true);

  // Never block the form on network — hydrate from auth, then soft-refresh.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setRefreshing(true);
      try {
        const profile = await withTimeout(fetchCurrentProfile(), FETCH_MS);
        if (cancelled) return;
        setUsername(profile.username || fallbackUsername);
        setAvatar(profile.avatar || '');
        setBio(typeof profile.bio === 'string' ? profile.bio : '');
        setStatus(typeof profile.status === 'string' ? profile.status : '');
      } catch (e: unknown) {
        // Keep local fields; soft-fail so the screen is never stuck on a spinner
        console.warn('[EditProfile] profile refresh failed', e);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [fallbackUsername]);

  const handleSave = async () => {
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      const msg = 'Username must be at least 3 characters';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Check username', msg);
      return;
    }

    try {
      setSaving(true);
      const trimmedAvatar = avatar.trim();
      const trimmedBio = bio.trim();
      const trimmedStatus = status.trim();

      const payload: {
        username: string;
        avatar?: string;
        metadata: Record<string, unknown>;
      } = {
        username: trimmedUsername,
        metadata: {
          bio: trimmedBio,
          status: trimmedStatus,
        },
      };
      if (trimmedAvatar) {
        payload.avatar = trimmedAvatar;
      }

      await updateProfileOnServer(payload);
      updateUser({
        username: trimmedUsername,
        avatar: trimmedAvatar || undefined,
        bio: trimmedBio || null,
        status: trimmedStatus || null,
      });
      try {
        await withTimeout(Promise.resolve(refreshProfile()), FETCH_MS);
      } catch {
        /* non-blocking */
      }

      if (Platform.OS === 'web') alert('Profile updated');
      else Alert.alert('Saved', 'Your profile has been updated');
      navigation.goBack();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not save profile';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const previewUri = resolveAvatarUri(
    user?.id || 'me',
    username || fallbackUsername,
    avatar || undefined
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`}>
      <View style={tw`px-5 pt-3 pb-2 flex-row items-center justify-between`}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={tw`w-10 h-10 rounded-full bg-white border border-stone-200 items-center justify-center`}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color="#1C1917" />
        </TouchableOpacity>
        <View style={tw`items-center flex-1 px-3`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
            Grow!
          </Text>
          <Text style={tw`text-lg font-bold text-stone-900`}>Edit profile</Text>
        </View>
        <View style={tw`w-10 items-center justify-center`}>
          {refreshing ? <ActivityIndicator size="small" color="#059669" /> : null}
        </View>
      </View>

      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`px-5 pt-2 pb-10`}
        keyboardShouldPersistTaps="handled"
      >
        <View style={tw`items-center mb-6 mt-2`}>
          <View style={tw`w-24 h-24 rounded-full overflow-hidden border-2 border-emerald-600/30 bg-[#EAE4D6]`}>
            <Image source={{ uri: previewUri }} style={tw`w-full h-full`} />
          </View>
          <Text style={tw`text-xs text-stone-500 mt-3 text-center`}>
            Preview uses your avatar URL or a generated fallback
          </Text>
        </View>

        <View style={tw`bg-[#EAE4D6] border border-stone-200/80 rounded-2xl p-4 mb-3`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
            Identity
          </Text>

          <Text style={tw`text-sm font-semibold text-stone-800 mb-1.5`}>Username</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Your display name"
            placeholderTextColor="#A8A29E"
            autoCapitalize="none"
            autoCorrect={false}
            style={tw`bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 mb-1`}
          />
          <Text style={tw`text-xs text-stone-500 mb-4`}>At least 3 characters</Text>

          <Text style={tw`text-sm font-semibold text-stone-800 mb-1.5`}>Status</Text>
          <TextInput
            value={status}
            onChangeText={setStatus}
            placeholder="What are you focusing on?"
            placeholderTextColor="#A8A29E"
            maxLength={80}
            style={tw`bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 mb-4`}
          />

          <Text style={tw`text-sm font-semibold text-stone-800 mb-1.5`}>Bio</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="A short intro about your growth journey"
            placeholderTextColor="#A8A29E"
            multiline
            maxLength={280}
            style={tw`bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 min-h-[96px]`}
            textAlignVertical="top"
          />
        </View>

        <View style={tw`bg-white border border-stone-200/80 rounded-2xl p-4 mb-5`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
            Avatar
          </Text>
          <Text style={tw`text-sm font-semibold text-stone-800 mb-1.5`}>Image URL</Text>
          <TextInput
            value={avatar}
            onChangeText={setAvatar}
            placeholder="https://…"
            placeholderTextColor="#A8A29E"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={tw`bg-[#F3EEE4] border border-stone-200 rounded-xl px-4 py-3 text-stone-900`}
          />
          <Text style={tw`text-xs text-stone-500 mt-2`}>Optional HTTPS link to a square photo</Text>
        </View>

        <TouchableOpacity
          onPress={() => void handleSave()}
          disabled={saving}
          style={tw`bg-emerald-600 rounded-2xl py-4 items-center ${saving ? 'opacity-60' : ''}`}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={tw`text-white font-bold text-base`}>Save profile</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
