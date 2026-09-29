import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import { createFeedPost, type FeedPost } from '../../services/api/feed';
import { uploadMediaApi, uploadMediaFile, isVideoMedia } from '../../services/api/media';
import { isRemoteMediaUrl } from '../../utils/mediaUri';
import { useAuth, useAppDispatch } from '../../store/hooks';
import { prependFeedPost } from '../../store/slices/feedSlice';
import PhotoEditor from '../../components/ui/PhotoEditor';
import VideoEditor, {
  ReelVideoPlayer,
  DEFAULT_VIDEO_EDIT,
  type VideoEditSettings,
} from '../../components/ui/VideoEditor';
import ReelCameraCapture from '../../components/ui/videoEditor/ReelCameraCapture';
import ScreenHeader from '../../components/ui/ScreenHeader';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import PostComposerLayout from '../Post/components/PostComposerLayout';
import PostCaptionOverlay from '../Post/components/PostCaptionOverlay';
import PostCategorySheet from '../Post/components/PostCategorySheet';
import PostStickyBar from '../Post/components/PostStickyBar';
import { openReelsAtPost } from '../../utils/reelNavigation';
import { reelSoundtrackFromEdit } from '../../utils/reelMedia';
import { fitReelStage } from '../../utils/fitMediaBox';
import tw from '../../lib/tw';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CreateReel'>;
type Props = { navigation: Nav };
type MediaKind = 'image' | 'video';

const HEADER_OFFSET = 56;

function StepPill({ label, active, done }: { label: string; active?: boolean; done?: boolean }) {
  return (
    <View
      style={tw`flex-row items-center px-3 py-1.5 rounded-full mr-2 ${
        active ? 'bg-brand-600' : done ? 'bg-white/20' : 'bg-white/10'
      }`}
    >
      {done ? <Ionicons name="checkmark" size={12} color="#A7F3D0" style={tw`mr-1`} /> : null}
      <Text
        style={tw`text-[11px] font-bold ${active || done ? 'text-white' : 'text-white/50'}`}
      >
        {label}
      </Text>
    </View>
  );
}

function ToolChip({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={tw`flex-row items-center rounded-full px-3 py-2 mr-2 ${
        danger ? 'bg-red-500/80 border border-red-400/40' : 'bg-white/15 border border-white/20'
      }`}
      hitSlop={6}
    >
      <Ionicons name={icon} size={16} color="#FFFFFF" />
      <Text style={tw`text-white text-xs font-semibold ml-1.5`}>{label}</Text>
    </Pressable>
  );
}

function assetKind(asset: ImagePicker.ImagePickerAsset): MediaKind {
  const type = (asset.type || '').toLowerCase();
  if (type === 'video') return 'video';
  if (type === 'image') return 'image';
  const mime = (asset.mimeType || '').toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  if (isVideoMedia({ uri: asset.uri, contentType: mime })) return 'video';
  return 'image';
}

export default function CreateReelScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const { user, updateUser } = useAuth();
  const { width: windowW, height: windowH } = useWindowDimensions();
  const stage = fitReelStage(windowW, Math.round(windowH * 0.62));
  const userCategories = user?.categories || [];

  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<MediaKind>('image');
  const [mimeType, setMimeType] = useState<string | undefined>();
  const [caption, setCaption] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    userCategories[0] || null
  );
  const [posting, setPosting] = useState(false);
  const [showPhotoEditor, setShowPhotoEditor] = useState(false);
  const [showVideoEditor, setShowVideoEditor] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [videoEdit, setVideoEdit] = useState<VideoEditSettings>(DEFAULT_VIDEO_EDIT);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const [publishedPost, setPublishedPost] = useState<FeedPost | null>(null);
  const captionInputRef = useRef<import('react-native').TextInput>(null);

  useEffect(() => {
    if (mediaUri && !showPhotoEditor && !showVideoEditor) {
      const timer = setTimeout(() => captionInputRef.current?.focus(), 400);
      return () => clearTimeout(timer);
    }
  }, [mediaUri, showPhotoEditor, showVideoEditor]);

  const applyAsset = (asset: ImagePicker.ImagePickerAsset) => {
    const kind = assetKind(asset);
    setMediaKind(kind);
    setMimeType(asset.mimeType || undefined);
    setMediaUri(asset.uri);
    setVideoEdit(DEFAULT_VIDEO_EDIT);
  };

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      await alertMessage('Permission needed', 'Allow library access to create a reel.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.92,
      videoMaxDuration: 60,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets[0]) {
      applyAsset(result.assets[0]);
    }
  };

  const captureMedia = async () => {
    setShowCamera(true);
  };

  const onCameraCaptured = (result: {
    uri: string;
    kind: 'image' | 'video';
    mimeType?: string;
  }) => {
    setShowCamera(false);
    setMediaKind(result.kind);
    setMimeType(result.mimeType);
    setMediaUri(result.uri);
    setVideoEdit(DEFAULT_VIDEO_EDIT);
  };

  const clearMedia = () => {
    setMediaUri(null);
    setMediaKind('image');
    setMimeType(undefined);
    setCaption('');
    setVideoEdit(DEFAULT_VIDEO_EDIT);
  };

  const handleRemove = async () => {
    const confirmed = await confirmAsync(
      'Remove clip?',
      'This clears the media and caption for this reel draft.',
      { confirmLabel: 'Remove', destructive: true }
    );
    if (!confirmed) return;
    clearMedia();
  };

  const handleClose = async () => {
    if (!mediaUri && !caption.trim()) {
      navigation.goBack();
      return;
    }
    const confirmed = await confirmAsync('Discard reel?', 'Your draft will be lost.', {
      confirmLabel: 'Discard',
      destructive: true,
    });
    if (!confirmed) return;
    navigation.goBack();
  };

  const publishReel = async () => {
    if (!mediaUri || posting) return;
    if (!selectedCategory) {
      await alertMessage('Category required', 'Pick a growth path category for this reel.');
      setShowCategorySheet(true);
      return;
    }

    setPosting(true);
    try {
      let mediaUrl = mediaUri;
      let uploadedKind: MediaKind = mediaKind;
      let contentType = mimeType;

      if (!isRemoteMediaUrl(mediaUri)) {
        if (mediaKind === 'video') {
          const uploaded = await uploadMediaFile(mediaUri, 'reel', {
            mimeType: mimeType || 'video/mp4',
          });
          mediaUrl = uploaded.url;
          uploadedKind = uploaded.mediaType;
          contentType = uploaded.contentType;
        } else {
          let persistable = mediaUri;
          if (Platform.OS === 'web' && mediaUri.toLowerCase().startsWith('blob:')) {
            try {
              const res = await fetch(mediaUri);
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

          if (persistable.toLowerCase().startsWith('data:')) {
            mediaUrl = await uploadMediaApi(persistable, 'reel');
          } else {
            const uploaded = await uploadMediaFile(persistable, 'reel', {
              mimeType: mimeType || 'image/jpeg',
            });
            mediaUrl = uploaded.url;
            contentType = uploaded.contentType;
          }
        }
      }

      const category = selectedCategory.split(':')[0];
      const subcategory = selectedCategory.includes(':')
        ? selectedCategory.split(':')[1]
        : undefined;

      const soundtrack = reelSoundtrackFromEdit(videoEdit);

      const created = await createFeedPost({
        image_url: mediaUrl,
        caption: caption.trim() || '',
        category,
        subcategory,
        metadata: {
          format: 'reel',
          media_type: uploadedKind,
          content_type: contentType,
          ...(uploadedKind === 'video' ? { video_edit: videoEdit } : {}),
          ...(soundtrack.audioUrl
            ? { audio_url: soundtrack.audioUrl, audio_title: soundtrack.audioTitle }
            : {}),
        },
      });

      if (created?.data) {
        const serverMeta = created.data.metadata || {};
        dispatch(
          prependFeedPost({
            ...created.data,
            image_url: created.data.image_url || mediaUrl,
            feed_section: 'following',
            metadata: {
              format: 'reel',
              media_type: uploadedKind,
              content_type: contentType,
              ...serverMeta,
              ...(uploadedKind === 'video' ? { video_edit: videoEdit } : {}),
              ...(soundtrack.audioUrl
                ? { audio_url: soundtrack.audioUrl, audio_title: soundtrack.audioTitle }
                : {}),
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

      const newPostId = created?.data?.id || null;
      setPublishedPost(created?.data || null);
      setPublishedPostId(newPostId);
      setShowSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish reel';
      await alertMessage('Error', msg);
    } finally {
      setPosting(false);
    }
  };

  if (showPhotoEditor && mediaUri && mediaKind === 'image') {
    return (
      <PhotoEditor
        imageUri={mediaUri}
        title="Edit Reel"
        preferredAspect="9:16"
        enableOverlays
        onSave={(editedUri) => {
          setMediaUri(editedUri);
          setShowPhotoEditor(false);
        }}
        onCancel={() => setShowPhotoEditor(false)}
      />
    );
  }

  if (showVideoEditor && mediaUri && mediaKind === 'video') {
    return (
      <VideoEditor
        videoUri={mediaUri}
        title="Edit Reel"
        initialSettings={videoEdit}
        onSave={(settings) => {
          setVideoEdit(settings);
          setShowVideoEditor(false);
        }}
        onCancel={() => setShowVideoEditor(false)}
      />
    );
  }

  const canPublish = Boolean(mediaUri && selectedCategory && !posting);

  return (
    <PostComposerLayout
      footer={
        mediaUri ? (
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
      />

      {showSuccess && (
        <View style={tw`absolute inset-0 z-50 bg-brand-900/95 items-center justify-center px-8`}>
          <View style={tw`w-16 h-16 rounded-full bg-brand-600 items-center justify-center mb-4`}>
            <Ionicons name="checkmark" size={32} color="#fff" />
          </View>
          <Text style={tw`text-white text-2xl font-bold mb-2`}>Reel is live!</Text>
          <Text style={tw`text-white/70 text-center mb-8`}>
            Your clip is in the feed. Open Reels to watch and scroll more.
          </Text>
          {publishedPostId ? (
            <Pressable
              onPress={() => {
                const postId = publishedPostId;
                const seed = publishedPost;
                navigation.goBack();
                requestAnimationFrame(() => {
                  openReelsAtPost(navigation, postId, seed);
                });
              }}
              style={tw`w-full bg-brand-600 py-3.5 rounded-2xl items-center mb-3`}
            >
              <Text style={tw`text-white font-bold text-base`}>View in Reels</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => navigation.goBack()}
            style={tw`w-full py-3.5 rounded-2xl items-center border border-white/25`}
          >
            <Text style={tw`text-white font-semibold`}>Done</Text>
          </Pressable>
        </View>
      )}

      {!mediaUri ? (
        <View
          style={[
            tw`flex-1 items-center justify-center px-6 bg-brand-900`,
            { minHeight: stage.height },
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
              Tap for a photo, hold for video — then trim, style, and caption
            </Text>
          </View>
          <View style={tw`flex-row gap-3 w-full`}>
            <Pressable
              onPress={() => void captureMedia()}
              style={tw`flex-1 flex-row items-center justify-center rounded-2xl py-4 px-4 bg-brand-600`}
            >
              <Ionicons name="camera" size={22} color="#FFFFFF" style={tw`mr-2`} />
              <Text style={tw`font-semibold text-base text-white`}>Camera</Text>
            </Pressable>
            <Pressable
              onPress={() => void pickFromLibrary()}
              style={tw`flex-1 flex-row items-center justify-center rounded-2xl py-4 px-4 bg-white/15 border border-white/25`}
            >
              <Ionicons name="images" size={22} color="#FFFFFF" style={tw`mr-2`} />
              <Text style={tw`font-semibold text-base text-white`}>Library</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={tw`flex-1`}>
          <View style={tw`flex-row px-4 pt-2 pb-1`}>
            <StepPill label="Capture" done />
            <StepPill label="Preview" active />
            <StepPill label="Publish" />
          </View>
          <View
            style={[
              tw`w-full bg-black items-center justify-center`,
              { height: stage.height },
            ]}
          >
            <View
              style={[
                tw`relative overflow-hidden bg-black`,
                { width: stage.width, height: stage.height },
              ]}
            >
            {mediaKind === 'video' ? (
              <ReelVideoPlayer
                uri={mediaUri}
                settings={videoEdit}
                shouldPlay
                contentFit="cover"
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <Image
                source={{ uri: mediaUri }}
                style={tw`w-full h-full`}
                contentFit="cover"
                transition={200}
              />
            )}
            <View style={tw`absolute bottom-0 left-0 right-0 h-32 bg-black/40`} pointerEvents="none" />
            {posting && (
              <View style={tw`absolute inset-0 bg-black/50 items-center justify-center z-30`}>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text style={tw`text-white mt-3 font-medium`}>
                  {mediaKind === 'video' ? 'Uploading video…' : 'Publishing…'}
                </Text>
              </View>
            )}
            <View
              style={[tw`absolute right-3`, { top: HEADER_OFFSET, zIndex: 30 }]}
              pointerEvents="box-none"
            >
              <Pressable
                onPress={() =>
                  mediaKind === 'video' ? setShowVideoEditor(true) : setShowPhotoEditor(true)
                }
                style={tw`rounded-full p-2.5 bg-black/55`}
                hitSlop={8}
                accessibilityLabel="Edit reel"
              >
                <Ionicons
                  name={mediaKind === 'video' ? 'cut-outline' : 'color-wand-outline'}
                  size={20}
                  color="#FFFFFF"
                />
              </Pressable>
            </View>
            {mediaKind === 'video' && (
              <View style={tw`absolute left-3 bottom-3 bg-black/55 px-2.5 py-1 rounded-full`}>
                <Text style={tw`text-white text-xs font-semibold`}>Video</Text>
              </View>
            )}
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={tw`px-4 py-3`}
            style={tw`flex-grow-0`}
          >
            <ToolChip
              icon={mediaKind === 'video' ? 'cut-outline' : 'color-wand-outline'}
              label="Edit"
              onPress={() =>
                mediaKind === 'video' ? setShowVideoEditor(true) : setShowPhotoEditor(true)
              }
            />
            <ToolChip
              icon="images-outline"
              label="Replace"
              onPress={() => void pickFromLibrary()}
            />
            <ToolChip
              icon="trash-outline"
              label="Remove"
              danger
              onPress={() => void handleRemove()}
            />
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

      <ReelCameraCapture
        visible={showCamera}
        onClose={() => setShowCamera(false)}
        onCaptured={onCameraCaptured}
      />
    </PostComposerLayout>
  );
}
