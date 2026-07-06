import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useAuth, useAppDispatch, useAppSelector } from '../store/hooks';
import {
  setCurrentImage,
  setCurrentCaption,
  setSelectedCategory,
  setAudioTrack,
  setPosting,
  resetCurrentPost,
} from '../store/slices/postSlice';
import { createFeedPost } from '../services/api/feed';
import { uploadMediaApi } from '../services/api/media';
import { getPostImageUrl } from '../utils/images';
import { triggerPressFeedback } from '../utils/interactionFeedback';
import { alertMessage } from '../utils/confirmDialog';
import type { PostMusicTrack } from '../constants/postMusic';

async function blobToOptimizedDataUrl(uri: string): Promise<string> {
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
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function useCreatePost(onSuccess?: () => void) {
  const dispatch = useAppDispatch();
  const { image, caption, selectedCategory, audioTrack } = useAppSelector(
    (state) => state.posts.currentPost
  );
  const isPosting = useAppSelector((state) => state.posts.isPosting);
  const { user, updateUser } = useAuth();

  const userCategories = user?.categories || [];
  const hasDraft = Boolean(image || caption.trim() || audioTrack);

  const clearDraft = useCallback(() => {
    dispatch(resetCurrentPost());
  }, [dispatch]);

  const submitPost = useCallback(async () => {
    if (!image) {
      alertMessage('Image required', 'Please select an image to post.');
      return false;
    }

    if (!selectedCategory) {
      alertMessage('Category required', 'Please select one category before posting.');
      return false;
    }

    if (isPosting) return false;

    dispatch(setPosting(true));
    try {
      const category = selectedCategory.split(':')[0];
      const subcategory = selectedCategory.includes(':')
        ? selectedCategory.split(':')[1]
        : undefined;

      let persistableImage = image;
      if (Platform.OS === 'web' && image.toLowerCase().startsWith('blob:')) {
        try {
          persistableImage = await blobToOptimizedDataUrl(image);
        } catch {
          // Keep original URI if conversion fails
        }
      }

      const lower = persistableImage.toLowerCase();
      const isDirectRenderable =
        lower.startsWith('http://') ||
        lower.startsWith('https://') ||
        lower.startsWith('file://') ||
        lower.startsWith('content://') ||
        lower.startsWith('ph://') ||
        lower.startsWith('blob:') ||
        lower.startsWith('data:');

      const shouldUpload = lower.startsWith('data:');
      let imageUrl = isDirectRenderable
        ? persistableImage
        : getPostImageUrl(category, `${Date.now()}`);

      if (shouldUpload) {
        try {
          imageUrl = await uploadMediaApi(persistableImage, 'post');
        } catch {
          imageUrl = persistableImage;
        }
      }

      const metadata: Record<string, unknown> = {};
      if (audioTrack) {
        metadata.audio_url = audioTrack.url;
        metadata.audio_title = audioTrack.title;
      }

      await createFeedPost({
        image_url: imageUrl,
        caption: caption || '',
        category,
        subcategory,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      });

      const currentPoints = user?.points || 0;
      updateUser({ points: currentPoints + 10 });
      clearDraft();
      triggerPressFeedback();
      onSuccess?.();
      return true;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to post. Please try again.';
      alertMessage('Error', errorMessage);
      return false;
    } finally {
      dispatch(setPosting(false));
    }
  }, [
    image,
    caption,
    selectedCategory,
    audioTrack,
    isPosting,
    dispatch,
    user?.points,
    updateUser,
    clearDraft,
    onSuccess,
  ]);

  return {
    image,
    caption,
    selectedCategory,
    audioTrack,
    isPosting,
    userCategories,
    hasDraft,
    setImage: (uri: string | null) => dispatch(setCurrentImage(uri)),
    setCaption: (text: string) => dispatch(setCurrentCaption(text)),
    setCategory: (cat: string | null) => dispatch(setSelectedCategory(cat)),
    setAudioTrack: (track: PostMusicTrack | null) =>
      dispatch(
        setAudioTrack(track ? { id: track.id, title: track.title, url: track.url } : null)
      ),
    clearDraft,
    submitPost,
  };
}
