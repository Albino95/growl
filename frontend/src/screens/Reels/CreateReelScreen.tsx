import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Platform,
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
import ScreenHeader from '../../components/ui/ScreenHeader';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import PostComposerLayout from '../Post/components/PostComposerLayout';
import PostCaptionOverlay from '../Post/components/PostCaptionOverlay';
import PostCategorySheet from '../Post/components/PostCategorySheet';
import PostStickyBar from '../Post/components/PostStickyBar';
import tw from '../../lib/tw';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CreateReel'>;
type Props = { navigation: Nav };

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STAGE_HEIGHT = Math.min(Math.round(SCREEN_WIDTH * (16 / 9)), Math.round(SCREEN_HEIGHT * 0.62));
const HEADER_OFFSET = 56;

function ToolChip({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={tw`flex-row items-center rounded-full px-3 py-2 mr-2 bg-white/15 border border-white/20`}
      hitSlop={6}
    >
      <Ionicons name={icon} size={16} color="#FFFFFF" />
      <Text style={tw`text-white text-xs font-semibold ml-1.5`}>{label}</Text>
    </Pressable>
  );
}

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
  const [showSuccess, setShowSuccess] = useState(false);
  const captionInputRef = useRef<import('react-native').TextInput>(null);
  const openEditorAfterPick = useRef(false);

  useEffect(() => {
    if (image && openEditorAfterPick.current) {
      openEditorAfterPick.current = false;
      setShowEditor(true);
      return;
    }
    if (image && !showEditor) {
      const timer = setTimeout(() => captionInputRef.current?.focus(), 400);
      return () => clearTimeout(timer);
    }
  }, [image, showEditor]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alertMessage('Permission needed', 'Allow library access to create a reel.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.92,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets[0]) {
      openEditorAfterPick.current = true;
      setImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alertMessage('Permission needed', 'Allow camera access to capture a reel.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.92,
    });

    if (!result.canceled && result.assets[0]) {
      openEditorAfterPick.current = true;
      setImage(result.assets[0].uri);
    }
  };

  const handleRemove = async () => {
    const confirmed = await confirmAsync(
      'Remove clip?',
      'This clears the image and caption for this reel draft.',
      { confirmLabel: 'Remove', destructive: true }
    );
    if (!confirmed) return;
    setImage(null);
    setCaption('');
  };

  const handleClose = async () => {
    if (!image && !caption.trim()) {
      navigation.goBack();
      return;
    }
    const confirmed = await confirmAsync(
      'Discard reel?',
      'Your draft will be lost.',
      { confirmLabel: 'Discard', destructive: true }
    );
    if (!confirmed) return;
    navigation.goBack();
  };

  const publishReel = async () => {
    if (!image || posting) return;
    if (!selectedCategory) {
      alertMessage('Category required', 'Pick a growth path category for this reel.');
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

      setShowSuccess(true);
      setTimeout(() => navigation.goBack(), 600);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish reel';
      alertMessage('Error', msg);
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
    <PostComposerLayout
      footer={
        image ? (
          <PostStickyBar
            selectedCategory={selectedCategory}
            hasImage
            isPosting={posting}
            canPost={canPublish}
            onOpenCategory={() => setShowCategorySheet(true)}
            onSubmit={() => void publishReel()}
            submitLabel="Publish Reel"
          />
        ) : null
      }
    >
      <ScreenHeader
        title="Create Reel"
        onBack={() => void handleClose()}
        backIcon="close"
        transparent
        light
        style={tw`border-b-0 bg-transparent absolute top-0 left-0 right-0 z-20`}
        rightAction={
          image ? (
            <Pressable
              onPress={() => void handleRemove()}
              hitSlop={8}
              style={tw`w-10 h-10 items-center justify-center`}
              accessibilityLabel="Remove clip"
            >
              <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
            </Pressable>
          ) : undefined
        }
      />

      {showSuccess && (
        <View style={tw`absolute inset-0 z-50 bg-brand-600/90 items-center justify-center`}>
          <View style={tw`bg-white rounded-full p-4 mb-3`}>
            <Text style={tw`text-3xl`}>✓</Text>
          </View>
          <Text style={tw`text-white text-xl font-bold`}>Reel live!</Text>
        </View>
      )}

      {!image ? (
        <View
          style={[
            tw`flex-1 items-center justify-center px-6 bg-brand-900`,
            { minHeight: STAGE_HEIGHT },
          ]}
        >
          <View style={tw`items-center mb-10`}>
            <View style={tw`bg-white/15 rounded-full p-5 mb-4 border border-white/20`}>
              <Ionicons name="film-outline" size={48} color="#FFFFFF" />
            </View>
            <Text style={tw`text-white text-2xl font-bold mb-2 text-center`}>
              Create a vertical clip
            </Text>
            <Text style={tw`text-white/70 text-base text-center px-4`}>
              Shoot or pick a photo — then edit in 9:16 with looks, text, and cinematic edges
            </Text>
          </View>
          <View style={tw`flex-row gap-3 w-full`}>
            <Pressable
              onPress={() => void takePhoto()}
              style={tw`flex-1 flex-row items-center justify-center rounded-2xl py-4 px-4 bg-brand-600`}
            >
              <Ionicons name="camera" size={22} color="#FFFFFF" style={tw`mr-2`} />
              <Text style={tw`font-semibold text-base text-white`}>Camera</Text>
            </Pressable>
            <Pressable
              onPress={() => void pickImage()}
              style={tw`flex-1 flex-row items-center justify-center rounded-2xl py-4 px-4 bg-white/15 border border-white/25`}
            >
              <Ionicons name="images" size={22} color="#FFFFFF" style={tw`mr-2`} />
              <Text style={tw`font-semibold text-base text-white`}>Library</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={tw`flex-1`}>
          <View style={[tw`w-full relative bg-black`, { height: STAGE_HEIGHT }]}>
            <Image
              source={{ uri: image }}
              style={tw`w-full h-full`}
              contentFit="cover"
              transition={200}
            />
            <View style={tw`absolute bottom-0 left-0 right-0 h-32 bg-black/40`} pointerEvents="none" />
            {posting && (
              <View style={tw`absolute inset-0 bg-black/50 items-center justify-center z-30`}>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text style={tw`text-white mt-3 font-medium`}>Publishing…</Text>
              </View>
            )}
            <View
              style={[tw`absolute right-3 flex-row`, { top: HEADER_OFFSET, zIndex: 30 }]}
              pointerEvents="box-none"
            >
              <Pressable
                onPress={() => setShowEditor(true)}
                style={tw`rounded-full p-2.5 bg-black/55 mr-2`}
                hitSlop={8}
                accessibilityLabel="Edit reel"
              >
                <Ionicons name="color-wand-outline" size={20} color="#FFFFFF" />
              </Pressable>
              <Pressable
                onPress={() => void handleRemove()}
                style={tw`rounded-full p-2.5 bg-red-500/85`}
                hitSlop={8}
                accessibilityLabel="Remove clip"
              >
                <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={tw`px-4 py-3`}
            style={tw`flex-grow-0`}
          >
            <ToolChip icon="color-wand-outline" label="Edit" onPress={() => setShowEditor(true)} />
            <ToolChip icon="images-outline" label="Replace" onPress={() => void pickImage()} />
          </ScrollView>

          <PostCaptionOverlay
            caption={caption}
            onChangeCaption={setCaption}
            inputRef={captionInputRef}
          />
        </View>
      )}

      <PostCategorySheet
        visible={showCategorySheet}
        onClose={() => setShowCategorySheet(false)}
        userCategories={userCategories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />
    </PostComposerLayout>
  );
}
