import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import PressableScale from '../../components/ui/PressableScale';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import { useAuth } from '../../store/hooks';
import { fetchCurrentProfile, updateProfileOnServer } from '../../services/api/profile';
import { resolveAvatarUri, avatarSource } from '../../utils/images';
import { uploadMediaApi, uploadMediaFile } from '../../services/api/media';
import { isRemoteMediaUrl } from '../../utils/mediaUri';
import { alertMessage } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';
import FormTextInput from '../../components/ui/FormTextInput';

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
  const [teachingHeadline, setTeachingHeadline] = useState('');
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
        const th = (profile as { teaching_headline?: string | null }).teaching_headline;
        setTeachingHeadline(typeof th === 'string' ? th : '');
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
      let hosted = uri;
      if (!isRemoteMediaUrl(uri)) {
        if (uri.toLowerCase().startsWith('data:')) {
          hosted = await uploadMediaApi(uri, 'avatar');
        } else {
          const uploaded = await uploadMediaFile(uri, 'avatar');
          hosted = uploaded.url;
        }
      }
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
      quality: 0.72,
      exif: false,
      base64: false,
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
      quality: 0.72,
      exif: false,
      base64: false,
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
      const trimmedTeaching = teachingHeadline.trim();
      const nextAvatar = avatar.trim();

      await updateProfileOnServer({
        username: trimmedUsername,
        avatar: nextAvatar,
        metadata: {
          bio: trimmedBio,
          status: trimmedStatus,
          ...(user?.isInstructor
            ? { teaching_headline: trimmedTeaching || null }
            : {}),
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

      toast.success('Profile saved');
      navigation.goBack();
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-page`}>
      <View style={tw`px-gutter-wide pt-3 pb-2 flex-row items-center justify-between`}>
        <PressableScale
          onPress={() => navigation.goBack()}
          style={tw`w-10 h-10 rounded-full bg-card border border-line items-center justify-center`}
          accessibilityLabel="Go back"
          pressedScale={0.9}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.ink} />
        </PressableScale>
        <View style={tw`items-center flex-1 px-3`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase`}>
            Grow!
          </Text>
          <Text style={tw`text-lg font-bold text-ink`}>Edit profile</Text>
        </View>
        <View style={tw`w-10 items-center justify-center`}>
          {refreshing ? <ActivityIndicator size="small" color="#059669" /> : null}
        </View>
      </View>

      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`px-gutter-wide pt-2 pb-12`}
        keyboardShouldPersistTaps="handled"
      >
        {/* Instagram-style avatar hero */}
        <View style={tw`items-center mb-7 mt-4`}>
          <PressableScale
            onPress={() => setPickerOpen(true)}
            disabled={uploadingAvatar}
            accessibilityLabel="Change profile photo"
            style={tw`relative`}
          >
            <View
              style={tw`w-32 h-32 rounded-full overflow-hidden bg-raised border-[3px] border-card`}
            >
              <Image source={avatarSource(previewUri)} style={tw`w-full h-full`} contentFit="cover" />
              {uploadingAvatar ? (
                <View style={tw`absolute inset-0 bg-black/45 items-center justify-center`}>
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : null}
            </View>
            <View
              style={tw`absolute bottom-0.5 right-0.5 w-10 h-10 rounded-full bg-emerald-600 border-[3px] border-page items-center justify-center`}
            >
              <Ionicons name="camera" size={18} color="#FFFFFF" />
            </View>
          </PressableScale>

          <PressableScale
            onPress={() => setPickerOpen(true)}
            disabled={uploadingAvatar}
            style={tw`mt-4`}
          >
            <Text style={tw`text-base font-semibold text-emerald-700`}>
              {hasCustomAvatar ? 'Change profile photo' : 'Add profile photo'}
            </Text>
          </PressableScale>
          {hasCustomAvatar ? (
            <PressableScale onPress={removePhoto} disabled={uploadingAvatar} style={tw`mt-2`}>
              <Text style={tw`text-sm font-medium text-ink-3`}>Remove current photo</Text>
            </PressableScale>
          ) : null}
        </View>

        <View style={tw`bg-card border border-line/80 rounded-card p-4 mb-5`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-3`}>
            About you
          </Text>

          <Text style={tw`text-sm font-semibold text-stone-800 mb-1.5`}>Username</Text>
          <FormTextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Your display name"
            autoCapitalize="none"
            autoCorrect={false}
            style={tw`bg-page border-line rounded-control mb-1`}
          />
          <Text style={tw`text-xs text-ink-3 mb-4`}>At least 3 characters</Text>

          <Text style={tw`text-sm font-semibold text-stone-800 mb-1.5`}>Status</Text>
          <FormTextInput
            value={status}
            onChangeText={setStatus}
            placeholder="What are you focusing on?"
            maxLength={80}
            style={tw`bg-page border-line rounded-control mb-4`}
          />

          <Text style={tw`text-sm font-semibold text-stone-800 mb-1.5`}>Bio</Text>
          <FormTextInput
            value={bio}
            onChangeText={setBio}
            placeholder="A short intro about your growth journey"
            multiline
            maxLength={280}
            style={tw`bg-page border-line rounded-control min-h-[96px]`}
            textAlignVertical="top"
          />

          {user?.isInstructor ? (
            <View style={tw`mt-4`}>
              <Text style={tw`text-sm font-semibold text-stone-800 mb-1.5`}>Teaching headline</Text>
              <FormTextInput
                value={teachingHeadline}
                onChangeText={setTeachingHeadline}
                placeholder="e.g. Coaching first 10Ks with weekly form tips"
                maxLength={120}
                style={tw`bg-emerald-50 border-emerald-200 rounded-control`}
              />
              <Text style={tw`text-xs text-ink-3 mt-1.5`}>
                Shows on your public profile and instructor discovery cards.
              </Text>
            </View>
          ) : null}
        </View>

        <PressableScale
          onPress={() => void handleSave()}
          disabled={saving || uploadingAvatar}
          style={tw`bg-emerald-600 rounded-card py-4 items-center ${
            saving || uploadingAvatar ? 'opacity-60' : ''
          }`}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={tw`text-white font-bold text-base`}>Save profile</Text>
          )}
        </PressableScale>
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
            style={tw`bg-page rounded-t-sheet px-gutter-wide pt-4 pb-10`}
          >
            <View style={tw`w-10 h-1 rounded-full bg-stone-300 self-center mb-4`} />
            <Text style={tw`text-lg font-bold text-ink mb-1`}>Profile photo</Text>
            <Text style={tw`text-sm text-ink-3 mb-4`}>
              Pick a clear square photo — it shows on your posts and profile.
            </Text>

            <PressableScale
              onPress={() => void takePhoto()}
              style={tw`flex-row items-center py-3.5 border-b border-line/80`}
            >
              <View style={tw`w-10 h-10 rounded-full bg-emerald-50 items-center justify-center mr-3`}>
                <Ionicons name="camera-outline" size={20} color="#059669" />
              </View>
              <Text style={tw`text-body font-semibold text-ink`}>Take photo</Text>
            </PressableScale>

            <PressableScale
              onPress={() => void pickFromLibrary()}
              style={tw`flex-row items-center py-3.5 border-b border-line/80`}
            >
              <View style={tw`w-10 h-10 rounded-full bg-emerald-50 items-center justify-center mr-3`}>
                <Ionicons name="images-outline" size={20} color="#059669" />
              </View>
              <Text style={tw`text-body font-semibold text-ink`}>Choose from library</Text>
            </PressableScale>

            {hasCustomAvatar ? (
              <PressableScale
                onPress={removePhoto}
                style={tw`flex-row items-center py-3.5 border-b border-line/80`}
              >
                <View style={tw`w-10 h-10 rounded-full bg-red-50 items-center justify-center mr-3`}>
                  <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                </View>
                <Text style={tw`text-body font-semibold text-red-600`}>Remove current photo</Text>
              </PressableScale>
            ) : null}

            <PressableScale
              onPress={() => setPickerOpen(false)}
              style={tw`mt-4 py-3.5 rounded-card bg-card border border-line items-center`}
            >
              <Text style={tw`text-ink-2 font-semibold`}>Cancel</Text>
            </PressableScale>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
