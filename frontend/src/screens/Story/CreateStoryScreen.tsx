import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
  TextInput,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import { createStory } from '../../services/api/stories';
import { uploadMediaApi, uploadMediaFile } from '../../services/api/media';
import { isRemoteMediaUrl } from '../../utils/mediaUri';
import { formInputAccessoryProps } from '../../components/ui/KeyboardDoneAccessory';
import { alertMessage } from '../../utils/confirmDialog';
import PhotoEditor from '../../components/ui/PhotoEditor';
import VideoEditor, {
  ReelVideoPlayer,
  DEFAULT_VIDEO_EDIT,
  type VideoEditSettings,
} from '../../components/ui/VideoEditor';
import tw from '../../lib/tw';
import { FAST_STORY_CAMERA, FAST_STORY_PICKER } from '../../utils/prepareImageUpload';
import { persistPickerAsset, pickedFromAsset } from '../../utils/pickedMedia';
import {
  buildPlaceholders,
  frameCountForDuration,
  sampleClipFramesQuiet,
  stillSourceFromFrames,
  type FrameThumb,
} from '../../components/ui/videoEditor/extractFrames';
import {
  nativeEditorOpenMs,
  nativePublishUnloadMs,
  waitMs,
} from '../../components/ui/videoEditor/videoEditorPolicy';
import { useDeferredNativePlayer } from '../../components/ui/videoEditor/useDeferredNativePlayer';
import EditorErrorBoundary from '../../components/ui/EditorErrorBoundary';
import GrowLoader from '../../components/ui/GrowLoader';
import { feedback, hushNativeAudio } from '../../utils/interactionFeedback';

type CreateStoryNavigationProp = NativeStackNavigationProp<RootStackParamList, 'CreateStory'>;
type MediaKind = 'image' | 'video';

type Props = {
  navigation: CreateStoryNavigationProp;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function CreateStoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [image, setImage] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<MediaKind>('image');
  const [mimeType, setMimeType] = useState<string | undefined>();
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showVideoEditor, setShowVideoEditor] = useState(false);
  const [videoEdit, setVideoEdit] = useState<VideoEditSettings>(DEFAULT_VIDEO_EDIT);
  const [openingCamera, setOpeningCamera] = useState(false);
  const [importing, setImporting] = useState(false);
  const [openingEditor, setOpeningEditor] = useState(false);
  const [clipDurationMs, setClipDurationMs] = useState(0);
  const [clipFrames, setClipFrames] = useState<FrameThumb[]>([]);
  const [wantPlay, setWantPlay] = useState(false);
  const [stillsBusy, setStillsBusy] = useState(false);
  const clipStill = stillSourceFromFrames(clipFrames);
  const previewActive = Boolean(
    wantPlay &&
      !stillsBusy &&
      image &&
      mediaKind === 'video' &&
      !openingEditor &&
      !posting &&
      !showVideoEditor &&
      !showEditor
  );
  const previewArmed = useDeferredNativePlayer(previewActive);

  useEffect(() => {
    if (!openingEditor) return;
    if (stillsBusy) return;
    if (mediaKind !== 'video') {
      setShowEditor(true);
      setOpeningEditor(false);
      return;
    }
    const delay = previewArmed ? nativeEditorOpenMs() : 0;
    const t = setTimeout(() => {
      setShowVideoEditor(true);
      setOpeningEditor(false);
    }, delay);
    return () => clearTimeout(t);
  }, [openingEditor, mediaKind, stillsBusy, previewArmed]);

  const blobToOptimizedDataUrl = async (uri: string): Promise<string> => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return uri;
    const res = await fetch(uri);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const imageEl = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not decode selected image'));
        img.src = objectUrl;
      });

      const maxDim = 1400;
      const scale = Math.min(1, maxDim / Math.max(imageEl.width, imageEl.height));
      const width = Math.max(1, Math.round(imageEl.width * scale));
      const height = Math.max(1, Math.round(imageEl.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return uri;
      ctx.drawImage(imageEl, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', 0.82);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const applyAsset = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    setImporting(true);
    try {
      const immediate = pickedFromAsset(asset);
      setMediaKind(immediate.kind);
      setMimeType(immediate.mimeType);
      setClipDurationMs(immediate.durationMs);
      const nextEdit = { ...DEFAULT_VIDEO_EDIT };
      if (immediate.kind === 'video' && immediate.durationMs > 30000) {
        nextEdit.trimEndMs = 30000;
      }
      setVideoEdit(nextEdit);
      setShowEditor(false);
      setShowVideoEditor(false);
      setOpeningEditor(false);
      setWantPlay(false);
      let uri = immediate.uri;
      let kind = immediate.kind;
      let durationMs = immediate.durationMs;
      const picked = await persistPickerAsset(asset);
      if (picked.uri) uri = picked.uri;
      kind = picked.kind;
      if (picked.mimeType) setMimeType(picked.mimeType);
      if (picked.durationMs > 0) durationMs = picked.durationMs;
      setMediaKind(kind);
      setClipDurationMs(durationMs);
      if (kind === 'video') {
        setClipFrames(buildPlaceholders(durationMs, frameCountForDuration(durationMs)));
        setWantPlay(false);
        setStillsBusy(true);
        setImage(uri);
        hushNativeAudio(1800);
        try {
          const frames = await sampleClipFramesQuiet(uri, durationMs, setClipFrames);
          setClipFrames(frames);
        } finally {
          setStillsBusy(false);
        }
      } else {
        setClipFrames([]);
        setImage(uri);
      }
    } finally {
      setImporting(false);
      setOpeningCamera(false);
    }
  }, []);

  const pickMedia = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alertMessage('Permission needed', 'Allow library access to publish a story.');
      setOpeningCamera(false);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync(FAST_STORY_PICKER);
    hushNativeAudio(1800);

    if (!result.canceled && result.assets[0]) {
      await applyAsset(result.assets[0]);
    } else {
      setOpeningCamera(false);
    }
  }, [applyAsset]);

  const takePhoto = useCallback(async () => {
    setOpeningCamera(true);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        alertMessage('Permission needed', 'Allow camera access to capture a story.');
        setOpeningCamera(false);
        return;
      }

      const result = await ImagePicker.launchCameraAsync(FAST_STORY_CAMERA);
      hushNativeAudio(1800);

      if (!result.canceled && result.assets[0]) {
        await applyAsset(result.assets[0]);
      } else {
        setOpeningCamera(false);
      }
    } catch {
      setOpeningCamera(false);
      alertMessage('Camera unavailable', 'Use your gallery instead, or try again.');
    }
  }, [applyAsset]);

  const publishStory = async () => {
    if (!image || posting) return;
    setPosting(true);
    try {
      if (mediaKind === 'video' && previewArmed) {
        await waitMs(nativePublishUnloadMs());
      }
      let persistable = image;
      if (mediaKind === 'image' && Platform.OS === 'web' && image.toLowerCase().startsWith('blob:')) {
        try {
          persistable = await blobToOptimizedDataUrl(image);
        } catch (err) {
          console.warn('[CreateStoryScreen] blob conversion failed, using original URI', err);
        }
      }

      let imageUrl = persistable;
      if (!isRemoteMediaUrl(persistable)) {
        try {
          if (mediaKind === 'video') {
            const uploaded = await uploadMediaFile(persistable, 'story', {
              mimeType: mimeType || 'video/mp4',
              fileName: mimeType?.includes('quicktime') ? 'story.mov' : 'story.mp4',
            });
            imageUrl = uploaded.url;
          } else if (persistable.toLowerCase().startsWith('data:')) {
            imageUrl = await uploadMediaApi(persistable, 'story');
          } else {
            const uploaded = await uploadMediaFile(persistable, 'story');
            imageUrl = uploaded.url;
          }
        } catch (uploadErr: unknown) {
          const msg =
            uploadErr instanceof Error ? uploadErr.message : 'Media upload failed';
          alertMessage(
            'Story not published',
            `${msg}\n\nYour draft is still here. We never replace your photo.`
          );
          return;
        }
      }

      if (!isRemoteMediaUrl(imageUrl) || !/\/api\/[^/]+\/media\//i.test(imageUrl)) {
        alertMessage(
          'Story not published',
          'Your media did not finish uploading. Your draft is still here — try again.'
        );
        return;
      }

      if (mediaKind === 'video') {
        try {
          const u = new URL(imageUrl);
          if (videoEdit.trimStartMs > 0) {
            u.searchParams.set('ts', String(Math.round(videoEdit.trimStartMs)));
          }
          if (videoEdit.trimEndMs > 0) {
            u.searchParams.set('te', String(Math.round(videoEdit.trimEndMs)));
          }
          imageUrl = u.toString();
        } catch {
          /* keep uploaded url */
        }
      }

      await createStory({
        image_url: imageUrl,
        caption: caption.trim() || undefined,
      });

      feedback.success();
      navigation.goBack();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish story';
      alertMessage('Story not published', `${msg}\n\nYour draft is still here.`);
    } finally {
      setPosting(false);
    }
  };

  if (showEditor && image && mediaKind === 'image') {
    return (
      <EditorErrorBoundary onClose={() => setShowEditor(false)}>
        <PhotoEditor
          imageUri={image}
          title="Your story"
          preferredAspect="9:16"
          enableOverlays
          onSave={(editedUri) => {
            setImage(editedUri);
            setShowEditor(false);
          }}
          onCancel={() => {
            setShowEditor(false);
            setOpeningCamera(false);
          }}
        />
      </EditorErrorBoundary>
    );
  }

  if (showVideoEditor && image && mediaKind === 'video') {
    return (
      <EditorErrorBoundary onClose={() => setShowVideoEditor(false)}>
        <VideoEditor
          videoUri={image}
          title="Edit story"
          initialSettings={videoEdit}
          maxClipMs={30000}
          hintDurationMs={clipDurationMs}
          initialFrames={clipFrames}
          onSave={(settings) => {
            setVideoEdit(settings);
            setShowVideoEditor(false);
          }}
          onCancel={() => setShowVideoEditor(false)}
        />
      </EditorErrorBoundary>
    );
  }

  if (!image) {
    return (
      <View style={[styles.captureRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={tw`flex-row items-center justify-between px-4 py-3`}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={tw`w-10 h-10 rounded-full bg-white/10 items-center justify-center`}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <Text style={tw`text-white text-base font-bold tracking-wide`}>Story</Text>
          <View style={tw`w-10`} />
        </View>

        <View style={tw`flex-1 items-center justify-center px-8`}>
          {openingCamera || importing ? (
            <>
              <ActivityIndicator size="large" color="#34D399" />
              <Text style={tw`text-stone-400 text-sm mt-4`}>
                {importing ? 'Adding to your story…' : 'Opening camera…'}
              </Text>
            </>
          ) : (
            <>
              <View
                style={[
                  tw`rounded-full items-center justify-center mb-6`,
                  { width: 88, height: 88, backgroundColor: 'rgba(16,185,129,0.15)' },
                ]}
              >
                <Ionicons name="sparkles-outline" size={40} color="#34D399" />
              </View>
              <Text style={tw`text-white text-xl font-bold text-center`}>Add to your story</Text>
              <Text style={tw`text-stone-400 text-sm text-center mt-2 mb-8 leading-5`}>
                Photo or a clip up to 30 seconds. Lives 24 hours.
              </Text>

              <Pressable
                onPress={() => {
                  feedback.open();
                  void pickMedia();
                }}
                style={tw`w-full flex-row items-center justify-center gap-2 bg-brand-600 py-4 rounded-full mb-3`}
              >
                <Ionicons name="images" size={22} color="#fff" />
                <Text style={tw`text-white font-bold text-base`}>Library</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  feedback.open();
                  void takePhoto();
                }}
                style={tw`w-full flex-row items-center justify-center gap-2 bg-white/10 border border-white/15 py-4 rounded-full`}
              >
                <Ionicons name="camera-outline" size={20} color="#fff" />
                <Text style={tw`text-white font-semibold text-base`}>Camera</Text>
              </Pressable>
            </>
          )}
        </View>

        {!openingCamera && !importing && (
          <View style={tw`flex-row items-center justify-center gap-10 px-6 pb-6`}>
            <Pressable onPress={() => void pickMedia()} style={tw`items-center`} hitSlop={8}>
              <View style={tw`w-12 h-12 rounded-xl border-2 border-white/40 overflow-hidden bg-stone-800 items-center justify-center`}>
                <Ionicons name="images" size={22} color="#A8A29E" />
              </View>
              <Text style={tw`text-stone-500 text-[10px] mt-1.5 font-semibold`}>Gallery</Text>
            </Pressable>
            <Pressable onPress={() => void takePhoto()} hitSlop={8}>
              <View
                style={[
                  tw`rounded-full border-4 border-white items-center justify-center`,
                  { width: 72, height: 72 },
                ]}
              >
                <View style={[tw`rounded-full bg-white`, { width: 58, height: 58 }]} />
              </View>
            </Pressable>
            <View style={tw`w-12 items-center opacity-0`}>
              <View style={tw`w-12 h-12`} />
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.captureRoot, { paddingTop: insets.top }]}>
      <View style={tw`flex-row items-center justify-between px-4 py-3`}>
        <Pressable
          onPress={() => {
            setImage(null);
            setCaption('');
            setMediaKind('image');
            setMimeType(undefined);
            setVideoEdit(DEFAULT_VIDEO_EDIT);
            setClipDurationMs(0);
            setClipFrames([]);
            setWantPlay(false);
            setOpeningCamera(false);
          }}
          hitSlop={12}
          style={tw`w-10 h-10 rounded-full bg-white/10 items-center justify-center`}
          accessibilityLabel="Retake"
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={tw`text-white text-base font-bold`}>Your story</Text>
        <Pressable
          onPress={() => {
            if (openingEditor || showVideoEditor || showEditor) return;
            hushNativeAudio(900);
            setWantPlay(false);
            setOpeningEditor(true);
          }}
          hitSlop={12}
          style={tw`w-10 h-10 rounded-full bg-white/10 items-center justify-center`}
          accessibilityLabel="Edit"
        >
          <Ionicons
            name={mediaKind === 'video' ? 'cut-outline' : 'color-filter-outline'}
            size={20}
            color="#fff"
          />
        </Pressable>
      </View>

      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`px-4 pb-4`}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            tw`rounded-3xl overflow-hidden bg-stone-900 border border-white/10`,
            { height: Math.min(SCREEN_H * 0.58, SCREEN_W * 1.55) },
          ]}
        >
          {mediaKind === 'video' && previewArmed && image ? (
            <ReelVideoPlayer
              uri={image}
              settings={videoEdit}
              shouldPlay={previewArmed && !posting && !showVideoEditor && !openingEditor}
              contentFit="cover"
              style={StyleSheet.absoluteFillObject}
            />
          ) : mediaKind === 'video' && clipStill ? (
            <Image source={clipStill as { uri: string }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          ) : mediaKind === 'video' ? (
            <View style={[StyleSheet.absoluteFillObject, tw`bg-black`]} />
          ) : (
            <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          )}
          {mediaKind === 'video' && !openingEditor ? (
            <View
              style={tw`absolute left-3 bottom-3 bg-black/55 px-2.5 py-1 rounded-full`}
              pointerEvents="none"
            >
              <Text style={tw`text-white text-xs font-semibold`}>Video · 30s max</Text>
            </View>
          ) : null}
          {mediaKind === 'video' && !wantPlay && !stillsBusy && !openingEditor && !posting && clipStill ? (
            <View
              pointerEvents="box-none"
              style={tw`absolute bottom-4 left-0 right-0 items-center z-20`}
            >
              <Pressable
                onPress={() => setWantPlay(true)}
                style={tw`w-12 h-12 rounded-full bg-black/70 items-center justify-center border border-white/20`}
                hitSlop={8}
                accessibilityLabel="Play clip"
              >
                <Ionicons name="play" size={22} color="#fff" />
              </Pressable>
            </View>
          ) : null}
          {openingEditor || posting || importing ? (
            <View style={tw`absolute inset-0 bg-black/55 items-center justify-center z-30`}>
              <GrowLoader
                label={
                  openingEditor
                    ? 'Opening editor…'
                    : posting
                      ? 'Growing your story…'
                      : 'Opening clip…'
                }
              />
            </View>
          ) : null}
        </View>

        <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mt-5 mb-2`}>
          Caption
        </Text>
        <TextInput
          {...formInputAccessoryProps({ multiline: true })}
          value={caption}
          onChangeText={setCaption}
          placeholder="Add a caption…"
          placeholderTextColor="#78716C"
          multiline
          maxLength={180}
          style={tw`bg-white/8 border border-white/10 rounded-2xl px-4 py-3.5 min-h-24 text-white text-base`}
        />
        <Text style={tw`text-stone-500 text-xs mt-2 text-right`}>{caption.length}/180</Text>
      </ScrollView>

      <View
        style={[
          tw`px-4 pt-3 border-t border-white/10 flex-row gap-3`,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <Pressable
          onPress={() => void pickMedia()}
          style={tw`flex-1 py-3.5 rounded-full bg-white/10 items-center justify-center border border-white/10`}
        >
          <Text style={tw`text-white font-semibold`}>Gallery</Text>
        </Pressable>
        <Pressable
          onPress={() => void publishStory()}
          disabled={posting}
          style={tw`flex-[1.4] py-3.5 rounded-full bg-brand-600 items-center justify-center flex-row gap-2`}
        >
          {posting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="paper-plane" size={18} color="#fff" />
              <Text style={tw`text-white font-bold`}>Share story</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  captureRoot: {
    flex: 1,
    backgroundColor: '#0C0A09',
  },
});
