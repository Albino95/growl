import React, { useState, useRef, useEffect } from 'react';
import { View, Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useRoute } from '@react-navigation/native';
import PhotoEditor from '../../components/ui/PhotoEditor';
import ScreenHeader from '../../components/ui/ScreenHeader';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import { useCreatePost } from '../../hooks/useCreatePost';
import { confirmAsync, alertMessage } from '../../utils/confirmDialog';
import PostComposerLayout from './components/PostComposerLayout';
import PostImageStage from './components/PostImageStage';
import PostCaptionOverlay from './components/PostCaptionOverlay';
import PostCategorySheet from './components/PostCategorySheet';
import PostMusicSheet from './components/PostMusicSheet';
import PostStickyBar from './components/PostStickyBar';
import { useAuth } from '../../store/hooks';
import tw from '../../lib/tw';
import { FAST_CAMERA, FAST_IMAGE_PICKER } from '../../utils/prepareImageUpload';
import { persistPickerAsset } from '../../utils/pickedMedia';
import EditorErrorBoundary from '../../components/ui/EditorErrorBoundary';
import { feedback } from '../../utils/interactionFeedback';

type PostScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Post'>;

interface PostScreenProps {
  navigation: PostScreenNavigationProp;
}

export default function PostScreen({ navigation }: PostScreenProps) {
  const route = useRoute<RouteProp<RootStackParamList, 'Post'>>();
  const { user } = useAuth();
  const [showEditor, setShowEditor] = useState(false);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [showMusicSheet, setShowMusicSheet] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const captionInputRef = useRef<import('react-native').TextInput>(null);
  const seeded = useRef(false);

  const promoteExtras = {
    productId: route.params?.productId,
    promoteBusinessId: route.params?.promoteBusinessId,
    promoteBusinessName: route.params?.promoteBusinessName,
    referralInstructorId: user?.isInstructor ? user.id : undefined,
  };

  const {
    image,
    caption,
    selectedCategory,
    audioTrack,
    isPosting,
    postingPhase,
    userCategories,
    hasDraft,
    setImage,
    setCaption,
    setCategory,
    setAudioTrack,
    clearDraft,
    submitPost,
  } = useCreatePost(() => {
    setShowSuccess(true);
    setTimeout(() => {
      navigation.goBack();
    }, 600);
  }, promoteExtras);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (route.params?.caption) setCaption(route.params.caption);
    if (route.params?.category) setCategory(route.params.category);
  }, [route.params?.caption, route.params?.category, setCaption, setCategory]);

  useEffect(() => {
    if (image && !showEditor) {
      const timer = setTimeout(() => captionInputRef.current?.focus(), 400);
      return () => clearTimeout(timer);
    }
  }, [image, showEditor]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alertMessage('Permission needed', 'We need camera roll permissions to post images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync(FAST_IMAGE_PICKER);

    if (!result.canceled && result.assets[0]) {
      const picked = await persistPickerAsset(result.assets[0]);
      setImage(picked.uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alertMessage('Permission needed', 'We need camera permissions to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync(FAST_CAMERA);

    if (!result.canceled && result.assets[0]) {
      const picked = await persistPickerAsset(result.assets[0]);
      setImage(picked.uri);
    }
  };

  const handleRemovePhoto = async () => {
    const confirmed = await confirmAsync(
      'Remove photo?',
      'This will clear the image and caption for this draft.',
      { confirmLabel: 'Remove', destructive: true }
    );
    if (!confirmed) return;
    setImage(null);
    setCaption('');
    setAudioTrack(null);
  };

  const handleClose = async () => {
    if (!hasDraft) {
      navigation.goBack();
      return;
    }
    const confirmed = await confirmAsync(
      'Discard post?',
      'Your draft will be lost.',
      { confirmLabel: 'Discard', destructive: true }
    );
    if (!confirmed) return;
    clearDraft();
    navigation.goBack();
  };

  if (showEditor && image) {
    return (
      <EditorErrorBoundary onClose={() => setShowEditor(false)}>
        <PhotoEditor
          imageUri={image}
          title="Edit Post"
          preferredAspect="4:5"
          enableOverlays
          onSave={(editedUri) => {
            setImage(editedUri);
            setShowEditor(false);
          }}
          onCancel={() => setShowEditor(false)}
        />
      </EditorErrorBoundary>
    );
  }

  const canPost = Boolean(image && selectedCategory && !isPosting);
  const promoteName = route.params?.promoteBusinessName;

  return (
    <PostComposerLayout
      footer={
        image ? (
          <PostStickyBar
            selectedCategory={selectedCategory}
            audioTrack={audioTrack}
            hasImage
            isPosting={isPosting}
            canPost={canPost}
            submitLabel={
              postingPhase === 'uploading'
                ? 'Uploading photo…'
                : postingPhase === 'publishing'
                  ? 'Sharing…'
                  : postingPhase === 'preparing'
                    ? 'Preparing…'
                    : undefined
            }
            onOpenCategory={() => setShowCategorySheet(true)}
            onOpenMusic={() => setShowMusicSheet(true)}
            onSubmit={() => {
              if (/^(grow!?|🌱|still growing\.?)$/i.test(caption.trim())) {
                feedback.celebrate();
              }
              void submitPost();
            }}
            onLongSubmit={() => {
              feedback.egg();
              void submitPost();
            }}
          />
        ) : null
      }
    >
      <ScreenHeader
        title={promoteName ? 'Promote' : 'Create Post'}
        onBack={handleClose}
        backIcon="close"
        transparent
        light
        style={tw`border-b-0 bg-transparent z-20`}
      />

      {promoteName ? (
        <View
          style={tw`absolute top-24 left-4 right-4 z-30 px-3.5 py-2.5 rounded-2xl bg-emerald-700/95 border border-emerald-500/40`}
          pointerEvents="none"
        >
          <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-100 uppercase`}>
            Partnership
          </Text>
          <Text style={tw`text-sm font-bold text-white mt-0.5`} numberOfLines={1}>
            Promoting {promoteName}
          </Text>
        </View>
      ) : null}

      {showSuccess && (
        <View style={tw`absolute inset-0 z-50 bg-brand-600/90 items-center justify-center`}>
          <View style={tw`bg-white rounded-full p-4 mb-3`}>
            <Text style={tw`text-3xl`}>✓</Text>
          </View>
          <Text style={tw`text-white text-xl font-bold`}>Posted!</Text>
        </View>
      )}

      <PostImageStage
        image={image}
        isPosting={isPosting}
        hasMusic={Boolean(audioTrack)}
        onTakePhoto={takePhoto}
        onPickLibrary={pickImage}
        onEditPhoto={() => setShowEditor(true)}
        onRemovePhoto={() => void handleRemovePhoto()}
        onOpenMusic={() => setShowMusicSheet(true)}
      />

      {image && (
        <PostCaptionOverlay
          caption={caption}
          onChangeCaption={setCaption}
          inputRef={captionInputRef}
        />
      )}

      <PostCategorySheet
        visible={showCategorySheet}
        onClose={() => setShowCategorySheet(false)}
        userCategories={userCategories}
        selectedCategory={selectedCategory}
        onSelectCategory={setCategory}
      />

      <PostMusicSheet
        visible={showMusicSheet}
        onClose={() => setShowMusicSheet(false)}
        selectedTrack={audioTrack}
        onSelectTrack={setAudioTrack}
      />
    </PostComposerLayout>
  );
}
