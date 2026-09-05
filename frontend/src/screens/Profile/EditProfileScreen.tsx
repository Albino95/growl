import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { useAuth } from '../../store/hooks';
import { fetchCurrentProfile, updateProfileOnServer } from '../../services/api/profile';
import { resolveAvatarUri } from '../../utils/images';
import { uploadMediaApi } from '../../services/api/media';
import { isRemoteMediaUrl, uriToDataUrl } from '../../utils/mediaUri';
import { alertMessage } from '../../utils/confirmDialog';

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
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [bio, setBio] = useState(user?.bio || '');
  const [status, setStatus] = useState(user?.status || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setRefreshing(true);
      try {
        const profile = await withTimeout(fetchCurrentProfile(), FETCH_MS);
        if (cancelled) return;
        setUsername(profile.username || fallbackUsername);
        setAvatar(profile.avatar || '');
        setLocalPreview(null);
        setBio(typeof profile.bio === 'string' ? profile.bio : '');
        setStatus(typeof profile.status === 'string' ? profile.status : '');
      } catch (e: unknown) {
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

  const previewUri = useMemo(() => {
    if (localPreview) return localPreview;
    return resolveAvatarUri(user?.id || 'me', username || fallbackUsername, avatar || undefined);
  }, [localPreview, user?.id, username, fallbackUsername, avatar]);

  const hasCustomAvatar = Boolean(localPreview || (avatar && avatar.trim()));

  const applyPickedUri = async (uri: string) => {
    setPickerOpen(false);
    setLocalPreview(uri);
    setUploadingAvatar(true);
    try {
      const dataUrl = isRemoteMediaUrl(uri) ? uri : await uriToDataUrl(uri);
      const hosted = isRemoteMediaUrl(dataUrl)
        ? dataUrl
        : await uploadMediaApi(dataUrl, 'avatar');
      setAvatar(hosted);
      setLocalPreview(hosted);
    } catch (e: unknown) {
      setLocalPreview(null);
      alertMessage(
        'Photo upload failed',
        e instanceof Error ? e.message : 'Could not upload your photo. Try again.'
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const pickFromLibrary = async () => {
    const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm !== 'granted') {
      alertMessage('Permission needed', 'Allow photo library access to change your avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await applyPickedUri(result.assets[0].uri);
    } else {
      setPickerOpen(false);
    }
  };

  const takePhoto = async () => {
    const { status: perm } = await ImagePicker.requestCameraPermissionsAsync();
    if (perm !== 'granted') {
      alertMessage('Permission needed', 'Allow camera access to take a profile photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await applyPickedUri(result.assets[0].uri);
    } else {
      setPickerOpen(false);
    }
  };

  const removePhoto = () => {
    setPickerOpen(false);
    setAvatar('');
    setLocalPreview(null);
  };

  const handleSave = async () => {
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      alertMessage('Check username', 'Username must be at least 3 characters');
      return;
    }
    if (uploadingAvatar) {
      alertMessage('Almost ready', 'Wait for your photo to finish uploading.');
      return;
    }

    try {
      setSaving(true);
      const trimmedBio = bio.trim();
      const trimmedStatus = status.trim();
      const nextAvatar = avatar.trim();

      await updateProfileOnServer({
        username: trimmedUsername,
        avatar: nextAvatar,
        metadata: {
          bio: trimmedBio,
          status: trimmedStatus,
        },
      });
      updateUser({
        username: trimmedUsername,
        avatar: nextAvatar || undefined,
        bio: trimmedBio || null,
        status: trimmedStatus || null,
      });
      try {
        await withTimeout(Promise.resolve(refreshProfile()), FETCH_MS);
      } catch {
        /* non-blocking */
      }

      alertMessage('Saved', 'Your profile has been updated');
      navigation.goBack();
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

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
        contentContainerStyle={tw`px-5 pt-2 pb-12`}
        keyboardShouldPersistTaps="handled"
      >
        {/* Instagram-style avatar hero */}
        <View style={tw`items-center mb-7 mt-4`}>
          <TouchableOpacity
            onPress={() => setPickerOpen(true)}
            disabled={uploadingAvatar}
            activeOpacity={0.85}
            accessibilityLabel="Change profile photo"
            style={tw`relative`}
          >
            <View
              style={tw`w-32 h-32 rounded-full overflow-hidden bg-[#EAE4D6] border-[3px] border-white`}
            >
              <Image source={{ uri: previewUri }} style={tw`w-full h-full`} contentFit="cover" />
              {uploadingAvatar ? (
                <View style={tw`absolute inset-0 bg-black/45 items-center justify-center`}>
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : null}
            </View>
            <View
              style={tw`absolute bottom-0.5 right-0.5 w-10 h-10 rounded-full bg-emerald-600 border-[3px] border-[#F3EEE4] items-center justify-center`}
            >
              <Ionicons name="camera" size={18} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setPickerOpen(true)}
            disabled={uploadingAvatar}
            style={tw`mt-4`}
          >
            <Text style={tw`text-base font-semibold text-emerald-700`}>
              {hasCustomAvatar ? 'Change profile photo' : 'Add profile photo'}
            </Text>
          </TouchableOpacity>
          {hasCustomAvatar ? (
            <TouchableOpacity onPress={removePhoto} disabled={uploadingAvatar} style={tw`mt-2`}>
              <Text style={tw`text-sm font-medium text-stone-500`}>Remove current photo</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={tw`bg-white border border-stone-200/80 rounded-2xl p-4 mb-5`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
            About you
          </Text>

          <Text style={tw`text-sm font-semibold text-stone-800 mb-1.5`}>Username</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Your display name"
            placeholderTextColor="#A8A29E"
            autoCapitalize="none"
            autoCorrect={false}
            style={tw`bg-[#F3EEE4] border border-stone-200 rounded-xl px-4 py-3 text-stone-900 mb-1`}
          />
          <Text style={tw`text-xs text-stone-500 mb-4`}>At least 3 characters</Text>

          <Text style={tw`text-sm font-semibold text-stone-800 mb-1.5`}>Status</Text>
          <TextInput
            value={status}
            onChangeText={setStatus}
            placeholder="What are you focusing on?"
            placeholderTextColor="#A8A29E"
            maxLength={80}
            style={tw`bg-[#F3EEE4] border border-stone-200 rounded-xl px-4 py-3 text-stone-900 mb-4`}
          />

          <Text style={tw`text-sm font-semibold text-stone-800 mb-1.5`}>Bio</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="A short intro about your growth journey"
            placeholderTextColor="#A8A29E"
            multiline
            maxLength={280}
            style={tw`bg-[#F3EEE4] border border-stone-200 rounded-xl px-4 py-3 text-stone-900 min-h-[96px]`}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          onPress={() => void handleSave()}
          disabled={saving || uploadingAvatar}
          style={tw`bg-emerald-600 rounded-2xl py-4 items-center ${
            saving || uploadingAvatar ? 'opacity-60' : ''
          }`}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={tw`text-white font-bold text-base`}>Save profile</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Photo source sheet */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={tw`flex-1 justify-end bg-black/40`} onPress={() => setPickerOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={tw`bg-[#F3EEE4] rounded-t-3xl px-5 pt-4 pb-10`}
          >
            <View style={tw`w-10 h-1 rounded-full bg-stone-300 self-center mb-4`} />
            <Text style={tw`text-lg font-bold text-stone-900 mb-1`}>Profile photo</Text>
            <Text style={tw`text-sm text-stone-500 mb-4`}>
              Pick a clear square photo — it shows on your posts and profile.
            </Text>

            <TouchableOpacity
              onPress={() => void takePhoto()}
              style={tw`flex-row items-center py-3.5 border-b border-stone-200/80`}
            >
              <View style={tw`w-10 h-10 rounded-full bg-emerald-50 items-center justify-center mr-3`}>
                <Ionicons name="camera-outline" size={20} color="#059669" />
              </View>
              <Text style={tw`text-[15px] font-semibold text-stone-900`}>Take photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void pickFromLibrary()}
              style={tw`flex-row items-center py-3.5 border-b border-stone-200/80`}
            >
              <View style={tw`w-10 h-10 rounded-full bg-emerald-50 items-center justify-center mr-3`}>
                <Ionicons name="images-outline" size={20} color="#059669" />
              </View>
              <Text style={tw`text-[15px] font-semibold text-stone-900`}>Choose from library</Text>
            </TouchableOpacity>

            {hasCustomAvatar ? (
              <TouchableOpacity
                onPress={removePhoto}
                style={tw`flex-row items-center py-3.5 border-b border-stone-200/80`}
              >
                <View style={tw`w-10 h-10 rounded-full bg-red-50 items-center justify-center mr-3`}>
                  <Ionicons name="trash-outline" size={20} color="#DC2626" />
                </View>
                <Text style={tw`text-[15px] font-semibold text-red-600`}>Remove current photo</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={() => setPickerOpen(false)}
              style={tw`mt-4 py-3.5 rounded-2xl bg-white border border-stone-200 items-center`}
            >
              <Text style={tw`text-stone-700 font-semibold`}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
