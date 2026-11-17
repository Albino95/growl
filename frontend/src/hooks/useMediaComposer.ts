import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { NavigationAction } from '@react-navigation/native';
import { AppState, type TextInput } from 'react-native';
import { useAppDispatch, useAuth } from '../store/hooks';
import { prependFeedPost } from '../store/slices/feedSlice';
import type { FeedPost } from '../services/api/feed';
import {
  toComposerError,
  type ComposerKind,
  type PostPublishExtras,
} from '../services/createContent';
import { runPublish, type PublishInput } from '../services/publish/runPublish';
import { overallProgress } from '../services/publish/progress';
import { publishQueue } from '../state/usePublishQueue';
import { pickMedia, type PickSource } from '../utils/pickMedia';
import type { PickedMedia } from '../utils/pickedMedia';
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
import { toast } from '../state/useToastStore';
import {
  composerDraftNs,
  composerPendingNs,
  drafts,
  newIdempotencyKey,
  sanitizeComposerDraft,
  type ComposerDraft,
} from '../services/drafts';
import { isValidIdempotencyKey } from '../services/api/idempotency';
import { DEFAULT_VIDEO_EDIT } from '../components/ui/videoEditor/types';
import { useCreateFlowLeaveGuard } from './useCreateFlowLeaveGuard';
import { COMPOSER_CONFIG, COMPOSER_COPY } from './composerConfig';
import {
  canPublish as canPublishState,
  composerReducer,
  hasComposerDraft,
  initialComposerState,
  type ComposerAudio,
  type ComposerState,
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
const DRAFT_SAVE_MS = 800;
/** Drafts older than this aren't offered back. */
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isVideoKindLabel(kind: ComposerKind): string {
  return kind === 'reel' ? 'clip' : kind === 'story' ? 'photo or clip' : 'photo';
}

/** Snapshot of what's worth keeping for "Continue your draft?" (null = nothing). */
function draftFromState(
  kind: ComposerKind,
  s: ComposerState,
  idempotencyKey: string
): ComposerDraft | null {
  if (s.status === 'success' || s.status === 'importing') return null;
  if (!s.media && !s.caption.trim() && !s.audio) return null;
  return {
    kind,
    caption: s.caption,
    category: s.category,
    media: s.media
      ? {
          uri: s.media.uri,
          mediaType: s.media.mediaType,
          mimeType: s.media.mimeType,
          durationMs: s.media.durationMs,
        }
      : null,
    videoEdit: s.media?.mediaType === 'video' ? { ...s.videoEdit } : null,
    audio: s.audio,
    idempotencyKey,
  };
}
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
  /** In-place fallback only: 0..1 while publishing. */
  const [publishProgress, setPublishProgress] = useState(0);
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

  // --- persisted draft ("Continue your draft?") ------------------------------
  const userId = user?.id ?? null;
  const draftNs = composerDraftNs(kind);
  /** One key per draft: a retried / resumed publish can't create a duplicate. */
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());
  /** Autosave waits until the stored draft has been offered (or there was none). */
  const [draftHydrated, setDraftHydrated] = useState(false);
  /** Set once the user discards or the publish succeeds — never write again. */
  const draftClosedRef = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDraftSave = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
  }, []);

  const flushDraft = useCallback(() => {
    cancelDraftSave();
    if (draftClosedRef.current) return;
    const snapshot = draftFromState(kind, stateRef.current, idempotencyKeyRef.current);
    if (snapshot) void drafts.save(draftNs, userId, snapshot);
    else void drafts.clear(draftNs, userId);
  }, [cancelDraftSave, draftNs, kind, userId]);

  const dropDraft = useCallback(() => {
    draftClosedRef.current = true;
    cancelDraftSave();
    void drafts.clear(draftNs, userId);
  }, [cancelDraftSave, draftNs, userId]);

  // --- leave guard -----------------------------------------------------------
  const closeEditor = useCallback(() => dispatch({ type: 'CLOSE_EDITOR' }), []);
  const { leave, canAutoLeave } = useCreateFlowLeaveGuard({
    navigation,
    hasDraft: hasComposerDraft(state),
    busy: publishing,
    editorOpen: status === 'editing',
    onCloseEditor: closeEditor,
    onDiscard: () => {
      dropDraft();
      dispatch({ type: 'DISCARD' });
    },
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

  // Offer the saved draft once per open (skipped when the route seeds the draft).
  // Order: an "Edit" from the publish pill (restored without asking) → this
  // composer's autosaved draft → a draft whose background publish never
  // finished (app killed mid-upload).
  const seededByRoute = Boolean(
    initialCaption || postExtras?.productId || postExtras?.promoteBusinessId
  );
  useEffect(() => {
    let cancelled = false;

    const restore = (d: ComposerDraft, droppedMedia: boolean, upload?: ComposerUpload | null) => {
      if (isValidIdempotencyKey(d.idempotencyKey)) idempotencyKeyRef.current = d.idempotencyKey;
      if (d.media && (d.media.mediaType === 'image' || config.acceptsVideo)) {
        dispatch({ type: 'IMPORT_START' });
        applyPicked({
          uri: d.media.uri,
          kind: d.media.mediaType,
          mimeType: d.media.mimeType,
          durationMs: d.media.durationMs || 0,
        });
        if (d.media.mediaType === 'video' && d.videoEdit) {
          // Edits travel as metadata: replay them through the editor transition.
          dispatch({ type: 'OPEN_EDITOR' });
          dispatch({
            type: 'VIDEO_EDITED',
            settings: { ...DEFAULT_VIDEO_EDIT, ...(d.videoEdit as Partial<VideoEditSettings>) },
          });
        }
        // Hosted media from the failed attempt: re-sharing skips the upload.
        if (upload) dispatch({ type: 'RESTORE_UPLOAD', upload });
      }
      if (d.caption) dispatch({ type: 'SET_CAPTION', caption: d.caption });
      if (d.category) dispatch({ type: 'SET_CATEGORY', category: d.category });
      if (d.audio) dispatch({ type: 'SET_AUDIO', audio: d.audio });
      if (droppedMedia) {
        toast.info(`Pick your ${isVideoKindLabel(kind)} again — the old one was cleared`);
      }
    };

    void (async () => {
      const editRequest = publishQueue.getState().takeEditRequest(kind);
      if (editRequest) {
        const draft: ComposerDraft = {
          kind,
          caption: editRequest.input.caption,
          category: editRequest.input.category,
          media: { ...editRequest.input.media },
          videoEdit:
            editRequest.input.media.mediaType === 'video' ? { ...editRequest.input.videoEdit } : null,
          audio: editRequest.input.audio,
          idempotencyKey: editRequest.idempotencyKey,
        };
        const usable = await sanitizeComposerDraft(draft);
        if (cancelled) return;
        // This composer owns the draft again (its autosave takes over).
        void drafts.clear(composerPendingNs(kind), userId);
        if (usable) restore(usable.draft, usable.droppedMedia, editRequest.upload);
        setDraftHydrated(true);
        return;
      }
      if (seededByRoute) {
        setDraftHydrated(true);
        return;
      }
      let fromPending = false;
      let saved = await drafts.load<ComposerDraft>(draftNs, userId, {
        maxAgeMs: DRAFT_MAX_AGE_MS,
      });
      if (!saved) {
        const pending = await drafts.load<ComposerDraft>(composerPendingNs(kind), userId, {
          maxAgeMs: DRAFT_MAX_AGE_MS,
        });
        // Still uploading (or failed with the pill showing): leave it to the queue.
        if (pending && !publishQueue.getState().hasLiveJob(pending.data.idempotencyKey)) {
          saved = pending;
          fromPending = true;
        }
      }
      if (cancelled) return;
      if (!saved || saved.data.kind !== kind) {
        setDraftHydrated(true);
        return;
      }
      const clearSaved = () => {
        void drafts.clear(fromPending ? composerPendingNs(kind) : draftNs, userId);
      };
      const usable = await sanitizeComposerDraft(saved.data);
      if (cancelled) return;
      if (!usable) {
        clearSaved();
        setDraftHydrated(true);
        return;
      }
      const resume = await confirmAsync(
        'Continue your draft?',
        usable.droppedMedia
          ? 'Your caption is still here, but the photo or clip is no longer on this device.'
          : fromPending
            ? `Your ${config.noun.replace(/^an? /, '')} didn’t finish sharing.`
            : `You have an unfinished ${config.noun}.`,
        { confirmLabel: 'Continue', cancelLabel: 'Discard' }
      );
      if (cancelled) return;
      if (!resume) {
        clearSaved();
        setDraftHydrated(true);
        return;
      }
      // Only restore into an untouched composer.
      const now = stateRef.current;
      if (now.media || now.caption.trim() || now.status !== 'empty') {
        setDraftHydrated(true);
        return;
      }
      // A resumed pending draft moves back to this composer's own slot.
      if (fromPending) clearSaved();
      restore(usable.draft, usable.droppedMedia);
      setDraftHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // Once per mount; `applyPicked` is stable for a given kind.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave of the draft fields.
  useEffect(() => {
    if (!draftHydrated || draftClosedRef.current) return;
    if (state.status === 'importing' || state.status === 'success') return;
    cancelDraftSave();
    draftTimer.current = setTimeout(flushDraft, DRAFT_SAVE_MS);
    return cancelDraftSave;
  }, [
    draftHydrated,
    state.status,
    state.caption,
    state.category,
    state.media,
    state.videoEdit,
    state.audio,
    flushDraft,
    cancelDraftSave,
  ]);

  // Save right away when the app backgrounds, and when the screen goes away
  // with content that wasn't discarded or published.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && draftHydrated) flushDraft();
    });
    return () => sub.remove();
  }, [draftHydrated, flushDraft]);
  const flushDraftRef = useRef(flushDraft);
  flushDraftRef.current = flushDraft;
  const draftHydratedRef = useRef(draftHydrated);
  draftHydratedRef.current = draftHydrated;
  useEffect(
    () => () => {
      if (draftHydratedRef.current) flushDraftRef.current();
    },
    []
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
      // One success haptic + seedpop per publish; the overlay blooms the check.
      haptic('shared');
      dropDraft();
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
    [canAutoLeave, dropDraft, kind, leave, navigation]
  );

  /** Snapshot the draft into a self-contained publish input. */
  const publishInputFrom = useCallback(
    (s: ComposerState): PublishInput | null => {
      if (!s.media) return null;
      return {
        kind,
        media: s.media,
        caption: s.caption,
        category: s.category,
        videoEdit: s.videoEdit,
        audio: s.audio,
        frames: s.frames,
        extras: kind === 'post' ? postExtras : undefined,
        uploadMaxEdge: config.uploadMaxEdge,
        user,
      };
    },
    [config.uploadMaxEdge, kind, postExtras, user]
  );

  /**
   * Background flow (PublishHost mounted): persist the draft as "pending",
   * hand it to the queue, and close right away. The pill shows progress.
   */
  const shareInBackground = useCallback(
    (s: ComposerState, input: PublishInput) => {
      const idempotencyKey = idempotencyKeyRef.current;
      const snapshot = draftFromState(kind, s, idempotencyKey);
      // Kept until the publish succeeds — an app kill mid-upload offers it back.
      draftClosedRef.current = true;
      cancelDraftSave();
      void (async () => {
        if (snapshot) await drafts.save(composerPendingNs(kind), userId, snapshot);
        await drafts.clear(draftNs, userId);
      })();
      const upload = s.upload && s.upload.sourceUri === input.media.uri ? s.upload : null;
      publishQueue.getState().enqueue(input, {
        idempotencyKey,
        userId,
        thumbUri:
          input.media.mediaType === 'video'
            ? clipStill?.uri ?? null
            : input.media.uri,
        upload,
      });
      if (s.category && config.categoryRequired) rememberCategory(kind, s.category);
      setWantPlay(false);
      leave(() => navigation.goBack());
    },
    [
      cancelDraftSave,
      clipStill?.uri,
      config.categoryRequired,
      draftNs,
      kind,
      leave,
      navigation,
      rememberCategory,
      userId,
    ]
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
    const input = publishInputFrom(s);
    if (!input) return;

    if (publishQueue.getState().hosts > 0) {
      // The screen closes right after; this only blocks a double tap meanwhile.
      publishingRef.current = true;
      if (input.media.mediaType === 'video' && previewArmedRef.current) {
        setWantPlay(false);
        await waitMs(nativePublishUnloadMs());
      }
      shareInBackground(s, input);
      return;
    }

    // Fallback: no PublishHost mounted → publish in place behind the overlay.
    publishingRef.current = true;
    setPublishProgress(0);
    dispatch({ type: 'PUBLISH_START' });
    try {
      if (input.media.mediaType === 'video' && previewArmedRef.current) {
        await waitMs(nativePublishUnloadMs());
      }
      setWantPlay(false);
      const { result } = await runPublish(input, {
        // Stable per draft (restored drafts keep theirs): retrying the same draft
        // after a lost response returns the original post instead of a duplicate.
        idempotencyKey: idempotencyKeyRef.current,
        // Retry after a publish-only failure reuses the hosted media.
        cachedUpload: s.upload,
        onUploaded: (upload) => dispatch({ type: 'UPLOADED', upload }),
        onProgress: ({ parts, stage }) => {
          const phase =
            stage === 'uploading' ? 'uploading' : stage === 'finishing' ? 'publishing' : null;
          if (phase && stateRef.current.phase !== phase) dispatch({ type: 'PUBLISH_PHASE', phase });
          setPublishProgress((prev) => Math.max(prev, overallProgress(parts, stage)));
        },
      });
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
    finishSuccess,
    kind,
    publishInputFrom,
    reduxDispatch,
    rememberCategory,
    shareInBackground,
    updateUser,
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
    /** In-place fallback progress (0..1) while `publishing`. */
    publishProgress,
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
