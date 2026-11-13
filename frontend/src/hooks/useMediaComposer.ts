import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { NavigationAction } from '@react-navigation/native';
import type { TextInput } from 'react-native';
import { useAppDispatch, useAuth } from '../store/hooks';
import { prependFeedPost } from '../store/slices/feedSlice';
import type { FeedPost } from '../services/api/feed';
import {
  publishPost,
  publishReel,
  publishStory,
  toComposerError,
  uploadComposerMedia,
  type ComposerKind,
  type PostPublishExtras,
  type PublishFeedResult,
} from '../services/createContent';
import { pickMedia, type PickSource } from '../utils/pickMedia';
import type { PickedMedia } from '../utils/pickedMedia';
import { isRemoteMediaUrl } from '../utils/mediaUri';
import { uploadReelCover } from '../utils/uploadReelCover';
import { alertMessage, confirmAsync } from '../utils/confirmDialog';
import { feedback, hushNativeAudio } from '../utils/interactionFeedback';
import { haptic } from '../theme/haptics';
import { warmPhotoEditorSource } from '../components/ui/photoEditor/imageProcessing';
import {
  buildPlaceholders,
  frameCountForDuration,
  sampleClipFramesQuiet,
  stillSourceFromFrames,
} from '../components/ui/videoEditor/extractFrames';
import {
  nativeEditorOpenMs,
  nativePublishUnloadMs,
  waitMs,
} from '../components/ui/videoEditor/videoEditorPolicy';
import { useDeferredNativePlayer } from '../components/ui/videoEditor/useDeferredNativePlayer';
import type { VideoEditSettings } from '../components/ui/videoEditor/types';
import type { ReelCaptureResult } from '../components/ui/videoEditor/ReelCameraCapture';
import { useComposerPrefsStore } from '../state/useComposerPrefsStore';
import { useCreateFlowLeaveGuard } from './useCreateFlowLeaveGuard';
import { COMPOSER_CONFIG, COMPOSER_COPY } from './composerConfig';
import {
  canPublish as canPublishState,
  composerReducer,
  hasComposerDraft,
  initialComposerState,
  type ComposerAudio,
  type ComposerUpload,
} from './composerMachine';

type ComposerNavigation = {
  goBack: () => void;
  dispatch: (action: NavigationAction) => void;
  isFocused: () => boolean;
};

export type UseMediaComposerOptions = {
  kind: ComposerKind;
  navigation: ComposerNavigation;
  /** Seed the draft (Post route params). */
  initialCaption?: string;
  /** Explicit category (route param) — wins over the remembered one. */
  initialCategory?: string;
  /** Post only: promote / referral metadata. */
  postExtras?: PostPublishExtras;
};

const SUCCESS_HOLD_MS = 700;
const EGG_CAPTION = /^(grow!?|🌱|still growing\.?)$/i;

/**
 * Everything a create flow needs: pick → import → edit → publish (with phases,
 * retry and a kept draft on failure) → success, plus the leave guard.
 */
export function useMediaComposer({
  kind,
  navigation,
  initialCaption,
  initialCategory,
  postExtras,
}: UseMediaComposerOptions) {
  const config = COMPOSER_CONFIG[kind];
  const reduxDispatch = useAppDispatch();
  const { user, updateUser } = useAuth();
  const userCategories = useMemo(() => user?.categories || [], [user?.categories]);

  const [state, dispatch] = useReducer(
    composerReducer,
    { caption: initialCaption, category: initialCategory },
    (seed) => initialComposerState(seed)
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [wantPlay, setWantPlay] = useState(false);
  const [published, setPublished] = useState<FeedPost | null>(null);
  const captionInputRef = useRef<TextInput>(null);
  const publishingRef = useRef(false);
  const importTokenRef = useRef(0);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { status, media } = state;
  const isVideo = media?.mediaType === 'video';
  const publishing = status === 'publishing';

  // --- preview player (videos mount a native player only on demand) -------
  const previewActive = Boolean(
    wantPlay && !state.stillsBusy && isVideo && (status === 'ready' || status === 'error')
  );
  const previewArmed = useDeferredNativePlayer(previewActive);
  const previewArmedRef = useRef(previewArmed);
  previewArmedRef.current = previewArmed;
  const clipStill = stillSourceFromFrames(state.frames) as { uri: string } | null;

  // --- leave guard -----------------------------------------------------------
  const closeEditor = useCallback(() => dispatch({ type: 'CLOSE_EDITOR' }), []);
  const { leave, canAutoLeave } = useCreateFlowLeaveGuard({
    navigation,
    hasDraft: hasComposerDraft(state),
    busy: publishing,
    editorOpen: status === 'editing',
    onCloseEditor: closeEditor,
    onDiscard: () => dispatch({ type: 'DISCARD' }),
    discardTitle: config.discardTitle,
    discardMessage: COMPOSER_COPY.discardMessage,
  });

  useEffect(
    () => () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    },
    []
  );

  // --- category default: route param > remembered for this kind > first ----
  const prefsHydrated = useComposerPrefsStore((s) => s.hydrated);
  const remembered = useComposerPrefsStore((s) => s.lastCategory[kind]);
  const rememberCategory = useComposerPrefsStore((s) => s.rememberCategory);
  useEffect(() => {
    if (config.categoryRequired) void useComposerPrefsStore.getState().hydrate();
  }, [config.categoryRequired]);
  useEffect(() => {
    if (!config.categoryRequired || state.category || !prefsHydrated) return;
    const next =
      remembered && userCategories.includes(remembered) ? remembered : userCategories[0];
    if (next) dispatch({ type: 'SET_CATEGORY', category: next });
  }, [config.categoryRequired, state.category, prefsHydrated, remembered, userCategories]);

  // --- caption autofocus -----------------------------------------------------
  const captionFocusable = config.autofocusCaption && !!media && status === 'ready';
  useEffect(() => {
    if (!captionFocusable) return;
    const t = setTimeout(() => captionInputRef.current?.focus(), 400);
    return () => clearTimeout(t);
  }, [captionFocusable, media?.uri]);

  // --- import ----------------------------------------------------------------
  const applyPicked = useCallback(
    (picked: PickedMedia) => {
      const token = ++importTokenRef.current;
      setWantPlay(false);
      if (picked.kind === 'video' && !config.acceptsVideo) {
        dispatch({ type: 'IMPORT_CANCEL' });
        void alertMessage('Photos only', `Pick a photo for ${config.noun}.`);
        return;
      }
      const mediaItem = {
        uri: picked.uri,
        mediaType: picked.kind,
        mimeType: picked.mimeType,
        durationMs: picked.durationMs,
      };
      if (picked.kind === 'image') {
        // Start the editor's working copy now so Edit opens near-instantly.
        void warmPhotoEditorSource(picked.uri).catch(() => undefined);
        dispatch({ type: 'IMPORT_DONE', media: mediaItem, maxClipMs: config.maxClipMs });
        return;
      }
      const durationMs = picked.durationMs;
      dispatch({
        type: 'IMPORT_DONE',
        media: mediaItem,
        maxClipMs: config.maxClipMs,
        frames: buildPlaceholders(durationMs, frameCountForDuration(durationMs)),
      });
      hushNativeAudio(1800);
      const stale = () => token !== importTokenRef.current;
      void sampleClipFramesQuiet(picked.uri, durationMs, (frames) => {
        if (!stale()) dispatch({ type: 'SET_FRAMES', frames });
      })
        .then((frames) => {
          if (!stale()) dispatch({ type: 'SET_FRAMES', frames });
        })
        .catch(() => undefined /* stills are optional — keep placeholders */)
        .finally(() => {
          if (!stale()) dispatch({ type: 'STILLS_BUSY', busy: false });
        });
    },
    [config.acceptsVideo, config.maxClipMs, config.noun]
  );

  const pick = useCallback(
    async (source: PickSource) => {
      const s = stateRef.current;
      if (s.status === 'publishing' || s.status === 'importing' || s.status === 'editing') return;
      if (source === 'camera' && config.camera.type === 'reel-capture') {
        setCameraOpen(true);
        return;
      }
      feedback.open();
      const options = source === 'camera' && config.camera.type === 'picker'
        ? config.camera.options
        : config.library;
      let started = false;
      const picked = await pickMedia(source, {
        pickerOptions: options,
        noun: config.noun,
        onAsset: () => {
          started = true;
          dispatch({ type: 'IMPORT_START' });
        },
      });
      if (!picked) {
        if (started) dispatch({ type: 'IMPORT_CANCEL' });
        return;
      }
      applyPicked(picked);
    },
    [applyPicked, config.camera, config.library, config.noun]
  );

  /** ReelCameraCapture result (reel only). */
  const onCameraCaptured = useCallback(
    (result: ReelCaptureResult) => {
      setCameraOpen(false);
      dispatch({ type: 'IMPORT_START' });
      applyPicked({
        uri: result.uri,
        kind: result.kind,
        mimeType: result.mimeType,
        durationMs: result.durationMs || 0,
      });
    },
    [applyPicked]
  );

  // --- editors ---------------------------------------------------------------
  const openEditor = useCallback(() => {
    const s = stateRef.current;
    if (!s.media || (s.status !== 'ready' && s.status !== 'error')) return;
    hushNativeAudio(900);
    setWantPlay(false);
    dispatch({ type: 'OPEN_EDITOR' });
  }, []);

  // Arm the editor: wait for stills, and let a playing preview unload first.
  useEffect(() => {
    if (status !== 'editing' || state.editorShown || state.stillsBusy) return;
    if (!isVideo) {
      dispatch({ type: 'EDITOR_SHOWN' });
      return;
    }
    const delay = previewArmed ? nativeEditorOpenMs() : 0;
    const t = setTimeout(() => dispatch({ type: 'EDITOR_SHOWN' }), delay);
    return () => clearTimeout(t);
  }, [status, state.editorShown, state.stillsBusy, isVideo, previewArmed]);

  const savePhotoEdit = useCallback((uri: string) => dispatch({ type: 'PHOTO_EDITED', uri }), []);
  const saveVideoEdit = useCallback(
    (settings: VideoEditSettings) => dispatch({ type: 'VIDEO_EDITED', settings }),
    []
  );

  // --- draft fields ----------------------------------------------------------
  const setCaption = useCallback(
    (caption: string) => dispatch({ type: 'SET_CAPTION', caption }),
    []
  );
  const setCategory = useCallback(
    (category: string | null) => dispatch({ type: 'SET_CATEGORY', category }),
    []
  );
  const setAudio = useCallback(
    (audio: ComposerAudio | null) =>
      dispatch({ type: 'SET_AUDIO', audio: audio ? { id: audio.id, title: audio.title, url: audio.url } : null }),
    []
  );

  const removeMedia = useCallback(async () => {
    const s = stateRef.current;
    if (s.status === 'publishing' || s.status === 'importing') return;
    if (s.caption.trim() || s.edited || s.audio) {
      const ok = await confirmAsync(
        isVideo ? 'Remove clip?' : 'Remove photo?',
        'Your caption and edits will be cleared.',
        { confirmLabel: 'Remove', destructive: true }
      );
      if (!ok) return;
    }
    importTokenRef.current += 1;
    setWantPlay(false);
    dispatch({ type: 'REMOVE_MEDIA' });
  }, [isVideo]);

  // --- publish -----------------------------------------------------------------
  const finishSuccess = useCallback(
    (post: FeedPost | null) => {
      // One success haptic (+ sound) per publish; the overlay blooms the check.
      haptic('success');
      setPublished(post);
      dispatch({ type: 'PUBLISH_SUCCESS' });
      // Reel stays on its success sheet ("View in Reels"); others close.
      if (kind === 'reel') return;
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => {
        successTimer.current = null;
        if (canAutoLeave()) leave(() => navigation.goBack());
      }, SUCCESS_HOLD_MS);
    },
    [canAutoLeave, kind, leave, navigation]
  );

  const publish = useCallback(async () => {
    if (publishingRef.current) return;
    const s = stateRef.current;
    if (!s.media || (s.status !== 'ready' && s.status !== 'error')) return;
    if (config.categoryRequired && !s.category) {
      feedback.warn();
      setCategorySheetOpen(true);
      return;
    }
    publishingRef.current = true;
    dispatch({ type: 'PUBLISH_START' });
    const mediaItem = s.media;
    const mediaIsVideo = mediaItem.mediaType === 'video';
    try {
      if (mediaIsVideo && previewArmedRef.current) await waitMs(nativePublishUnloadMs());
      setWantPlay(false);

      // Retry after a publish-only failure reuses the hosted media.
      let upload: ComposerUpload | null =
        s.upload && s.upload.sourceUri === mediaItem.uri ? s.upload : null;
      const needsCover =
        kind === 'reel' && mediaIsVideo && !isRemoteMediaUrl(mediaItem.uri) &&
        typeof upload?.coverUrl !== 'string';
      // Cover never blocks publishing (resolves null on failure).
      const coverPromise: Promise<string | null> = needsCover
        ? uploadReelCover({
            videoUri: mediaItem.uri,
            durationMs: mediaItem.durationMs,
            edit: s.videoEdit,
            frames: s.frames,
          })
        : Promise.resolve(upload?.coverUrl ?? null);

      if (!upload) {
        dispatch({ type: 'PUBLISH_PHASE', phase: 'uploading' });
        const uploaded = await uploadComposerMedia(mediaItem.uri, kind, {
          mediaType: mediaItem.mediaType,
          mime: mediaItem.mimeType,
          maxEdge: config.uploadMaxEdge,
        });
        upload = { sourceUri: mediaItem.uri, ...uploaded };
        dispatch({ type: 'UPLOADED', upload });
      }

      if (kind === 'reel' && upload.mediaType === 'video' && typeof upload.coverUrl !== 'string') {
        const coverUrl = await coverPromise;
        if (coverUrl) {
          upload = { ...upload, coverUrl };
          dispatch({ type: 'UPLOADED', upload });
        }
      }

      dispatch({ type: 'PUBLISH_PHASE', phase: 'publishing' });
      let result: PublishFeedResult | null = null;
      if (kind === 'post') {
        result = await publishPost({
          mediaUrl: upload.url,
          caption: s.caption,
          category: s.category as string,
          audioTrack: s.audio,
          extras: postExtras,
          user,
        });
      } else if (kind === 'reel') {
        result = await publishReel({
          media: upload,
          caption: s.caption,
          category: s.category as string,
          videoEdit: s.videoEdit,
          coverUrl: upload.coverUrl,
          user,
        });
      } else {
        await publishStory({ media: upload, caption: s.caption, videoEdit: s.videoEdit });
      }

      if (result) {
        reduxDispatch(prependFeedPost(result.optimistic));
        if (typeof result.post.points_total === 'number') {
          updateUser({ points: result.post.points_total });
        }
      }
      if (s.category && config.categoryRequired) rememberCategory(kind, s.category);
      finishSuccess(result?.post ?? null);
    } catch (err) {
      feedback.error();
      dispatch({ type: 'PUBLISH_FAIL', message: toComposerError(err, 'publish').message });
    } finally {
      publishingRef.current = false;
    }
  }, [
    config.categoryRequired,
    config.uploadMaxEdge,
    finishSuccess,
    kind,
    postExtras,
    reduxDispatch,
    rememberCategory,
    updateUser,
    user,
  ]);

  /** Primary button tap (with the "grow!" caption easter egg). */
  const submit = useCallback(() => {
    if (EGG_CAPTION.test(stateRef.current.caption.trim())) feedback.celebrate();
    void publish();
  }, [publish]);

  const longSubmit = useCallback(() => {
    feedback.egg();
    void publish();
  }, [publish]);

  /** Banner "Edit": back to the draft with the editor open. */
  const editAfterError = useCallback(() => {
    dispatch({ type: 'DISMISS_ERROR' });
    openEditor();
  }, [openEditor]);

  /** Header close — the leave guard confirms / blocks as needed. */
  const requestClose = useCallback(() => navigation.goBack(), [navigation]);

  /** Leave without the guard (success sheet buttons). */
  const exit = useCallback((after?: () => void) => {
    leave(() => navigation.goBack());
    if (after) requestAnimationFrame(after);
  }, [leave, navigation]);

  const canPublish = canPublishState(state, { categoryRequired: config.categoryRequired });
  /** Share is tappable even without a category — tapping opens the picker. */
  const canSubmit = canPublishState(state, { categoryRequired: false });

  return {
    config,
    state,
    userCategories,
    // derived
    isVideo,
    publishing,
    canPublish,
    canSubmit,
    clipStill,
    previewArmed,
    wantPlay,
    editorVisible: status === 'editing' && state.editorShown,
    published,
    captionInputRef,
    // sheets / modals
    categorySheetOpen,
    setCategorySheetOpen,
    cameraOpen,
    setCameraOpen,
    // actions
    pick,
    onCameraCaptured,
    play: () => setWantPlay(true),
    openEditor,
    closeEditor,
    savePhotoEdit,
    saveVideoEdit,
    setCaption,
    setCategory,
    setAudio,
    removeMedia,
    submit,
    longSubmit,
    retry: publish,
    editAfterError,
    requestClose,
    exit,
  };
}

export type MediaComposer = ReturnType<typeof useMediaComposer>;
