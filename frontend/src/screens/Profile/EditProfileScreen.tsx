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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { useAuth } from '../../store/hooks';
import { fetchCurrentProfile, updateProfileOnServer } from '../../services/api/profile';

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const profile = await fetchCurrentProfile();
        setUsername(profile.username || user?.email?.split('@')[0] || '');
        setAvatar(profile.avatar || '');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Could not load profile';
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('Error', msg);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user?.email]);

  const handleSave = async () => {
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      Alert.alert('Validation Error', 'Username must be at least 3 characters');
      return;
    }

    try {
      setSaving(true);
      const payload: { username: string; avatar?: string } = { username: trimmedUsername };
      const trimmedAvatar = avatar.trim();
      if (trimmedAvatar) {
        payload.avatar = trimmedAvatar;
      }
      await updateProfileOnServer(payload);
      await refreshProfile();
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

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`}>
      <View style={tw`flex-row items-center justify-between px-4 py-3 bg-white border-b border-stone-200`}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={tw`text-lg font-semibold text-stone-900`}>Edit Profile</Text>
        <View style={tw`w-6`} />
      </View>

      {loading ? (
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <ScrollView style={tw`flex-1`} contentContainerStyle={tw`p-4`}>
          <View style={tw`bg-white rounded-xl p-4 mb-4`}>
            <Text style={tw`text-sm font-medium text-stone-700 mb-2`}>Username</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="Your display name"
              autoCapitalize="none"
              style={tw`bg-surface-page border border-stone-300 rounded-lg px-4 py-3 text-stone-900`}
            />
            <Text style={tw`text-xs text-stone-500 mt-2`}>At least 3 characters</Text>
          </View>

          <View style={tw`bg-white rounded-xl p-4 mb-4`}>
            <Text style={tw`text-sm font-medium text-stone-700 mb-2`}>Avatar URL</Text>
            <TextInput
              value={avatar}
              onChangeText={setAvatar}
              placeholder="https://example.com/avatar.jpg"
              autoCapitalize="none"
              keyboardType="url"
              style={tw`bg-surface-page border border-stone-300 rounded-lg px-4 py-3 text-stone-900`}
            />
            <Text style={tw`text-xs text-stone-500 mt-2`}>Optional — full HTTPS image URL</Text>
          </View>

          <TouchableOpacity
            onPress={() => void handleSave()}
            disabled={saving}
            style={tw`bg-brand-600 rounded-xl py-4 items-center ${saving ? 'opacity-60' : ''}`}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={tw`text-white font-bold text-base`}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
