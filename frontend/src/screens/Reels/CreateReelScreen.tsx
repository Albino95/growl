import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
  TextInput,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import { createFeedPost } from '../../services/api/feed';
import { uploadMediaApi } from '../../services/api/media';
import { isRemoteMediaUrl, uriToDataUrl } from '../../utils/mediaUri';
import { useAuth, useAppDispatch } from '../../store/hooks';
import { prependFeedPost } from '../../store/slices/feedSlice';
import PhotoEditor from '../../components/ui/PhotoEditor';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ScreenHeader from '../../components/ui/ScreenHeader';
import StickyFooter from '../../components/ui/StickyFooter';
import Screen from '../../components/ui/Screen';
import PostCategorySheet, { getCategoryLabel } from '../Post/components/PostCategorySheet';
import tw from '../../lib/tw';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CreateReel'>;

type Props = { navigation: Nav };

export default function CreateReelScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const { user, updateUser } = useAuth();
  const userCategories = user?.categories || [];

  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    userCategories[0] || null
  );
  const [posting, setPosting] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showCategorySheet, setShowCategorySheet] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow library access to create a reel.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.92,
    });

    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
      setShowEditor(true);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to capture a reel.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.92,
    });

    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
      setShowEditor(true);
    }
  };

  const showPicker = () => {
    Alert.alert('Create reel', 'Choose an image source', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const publishReel = async () => {
    if (!image || posting) return;
    if (!selectedCategory) {
      Alert.alert('Category required', 'Pick a growth path category for this reel.');
      setShowCategorySheet(true);
      return;
    }

    setPosting(true);
    try {
      let persistable = image;
      if (Platform.OS === 'web' && image.toLowerCase().startsWith('blob:')) {
        try {
          const res = await fetch(image);
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);
          try {
            const imageEl = await new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new window.Image();
              img.onload = () => resolve(img);
              img.onerror = () => reject(new Error('decode failed'));
              img.src = objectUrl;
            });
            const maxDim = 1600;
            const scale = Math.min(1, maxDim / Math.max(imageEl.width, imageEl.height));
            const width = Math.max(1, Math.round(imageEl.width * scale));
            const height = Math.max(1, Math.round(imageEl.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(imageEl, 0, 0, width, height);
              persistable = canvas.toDataURL('image/jpeg', 0.88);
            }
          } finally {
            URL.revokeObjectURL(objectUrl);
          }
        } catch {
          // keep original
        }
      }

      let imageUrl = persistable;
      if (!isRemoteMediaUrl(persistable)) {
        const dataUrl = persistable.toLowerCase().startsWith('data:')
          ? persistable
          : await uriToDataUrl(persistable);
        imageUrl = await uploadMediaApi(dataUrl, 'post');
      }

      const category = selectedCategory.split(':')[0];
      const subcategory = selectedCategory.includes(':')
        ? selectedCategory.split(':')[1]
        : undefined;

      const created = await createFeedPost({
        image_url: imageUrl,
        caption: caption.trim() || '',
        category,
        subcategory,
        metadata: { format: 'reel' },
      });

      if (created?.data) {
        const serverMeta = created.data.metadata || {};
        dispatch(
          prependFeedPost({
            ...created.data,
            image_url: created.data.image_url || imageUrl,
            feed_section: 'following',
            metadata: {
              format: 'reel',
              ...serverMeta,
              username:
                serverMeta.username ||
                user?.username ||
                user?.email?.split('@')[0] ||
                'You',
              avatar: serverMeta.avatar || user?.avatar,
              likes: Number(serverMeta.likes ?? 0),
              comments: Number(serverMeta.comments ?? 0),
              has_liked: !!serverMeta.has_liked,
            },
          })
        );
        if (typeof created.data.points_total === 'number') {
          updateUser({ points: created.data.points_total });
        }
      }

      if (Platform.OS === 'web') {
        alert('Reel published.');
      } else {
        Alert.alert('Reel published', 'Your vertical clip is live.');
      }
      navigation.goBack();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish reel';
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setPosting(false);
    }
  };

  if (showEditor && image) {
    return (
      <PhotoEditor
        imageUri={image}
        title="Edit Reel"
        preferredAspect="9:16"
        enableOverlays
        onSave={(editedUri) => {
          setImage(editedUri);
          setShowEditor(false);
        }}
        onCancel={() => setShowEditor(false)}
      />
    );
  }

  const canPublish = Boolean(image && selectedCategory && !posting);

  return (
    <Screen background="card" edges={['top', 'bottom']}>
      <ScreenHeader title="Create Reel" onBack={() => navigation.goBack()} backIcon="close" />

      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`p-4 pb-6`}
        keyboardShouldPersistTaps="handled"
      >
        {image ? (
          <View style={tw`relative mb-4 self-center w-full max-w-sm`}>
            <View
              style={[
                tw`rounded-2xl overflow-hidden bg-black w-full`,
                { aspectRatio: 9 / 16, maxHeight: 420 },
              ]}
            >
              <Image source={{ uri: image }} style={tw`w-full h-full`} contentFit="cover" />
            </View>
            <View style={tw`absolute top-3 right-3 flex-row gap-2`}>
              <TouchableOpacity
                style={tw`bg-black/45 rounded-full p-2`}
                onPress={() => setShowEditor(true)}
                accessibilityLabel="Edit reel"
              >
                <Ionicons name="color-filter-outline" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={tw`bg-black/45 rounded-full p-2`}
                onPress={() => setImage(null)}
                accessibilityLabel="Remove"
              >
                <Ionicons name="trash-outline" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={showPicker}
            style={[
              tw`w-full self-center max-w-sm rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 items-center justify-center mb-4`,
              { aspectRatio: 9 / 16, maxHeight: 420 },
            ]}
          >
            <Ionicons name="film-outline" size={44} color="#059669" />
            <Text style={tw`text-stone-700 font-semibold mt-2`}>Add vertical clip</Text>
            <Text style={tw`text-stone-500 text-sm mt-1`}>Opens the photo editor · 9:16</Text>
          </TouchableOpacity>
        )}

        <Pressable
          onPress={() => setShowCategorySheet(true)}
          style={tw`flex-row items-center justify-between bg-stone-100 rounded-xl px-4 py-3.5 mb-4`}
        >
          <View style={tw`flex-row items-center gap-2 flex-1`}>
            <Ionicons name="grid-outline" size={18} color="#57534E" />
            <Text style={tw`text-stone-800 font-medium`} numberOfLines={1}>
              {selectedCategory
                ? getCategoryLabel(selectedCategory)
                : 'Choose category'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
        </Pressable>

        <Text style={tw`text-sm font-semibold text-stone-700 mb-2`}>Caption (optional)</Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Say something about this reel..."
          placeholderTextColor="#A8A29E"
          multiline
          maxLength={220}
          style={tw`bg-stone-100 rounded-xl p-4 min-h-24 text-stone-800`}
        />
        <Text style={tw`text-xs text-stone-400 mt-2`}>{caption.length}/220</Text>
      </ScrollView>

      <StickyFooter>
        <PrimaryButton
          label="Publish Reel"
          onPress={publishReel}
          disabled={!canPublish}
          loading={posting}
        />
      </StickyFooter>

      <PostCategorySheet
        visible={showCategorySheet}
        onClose={() => setShowCategorySheet(false)}
        userCategories={userCategories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />
    </Screen>
  );
}
