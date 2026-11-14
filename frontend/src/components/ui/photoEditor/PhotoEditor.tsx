import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Dimensions,
  StyleSheet,
  PanResponder,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import tw from '../../../lib/tw';
import { alertMessage } from '../../../utils/confirmDialog';
import { feedback, triggerFeedback } from '../../../utils/interactionFeedback';

/** Media editors may hold a video/camera audio session: haptics only, no tap tones. */
const SILENT = { sound: false } as const;
import type {
  CropAspect,
  EditAdjustments,
  EditorTab,
  PhotoEditorProps,
  TextOverlay,
} from './types';
import { DEFAULT_ADJUSTMENTS, MAX_TEXT_OVERLAYS } from './types';
import { getPresetsForCategory } from './presets';
import FilterCategoryBar from './FilterCategoryBar';
import TextOverlayPanel from './TextOverlayPanel';
import { AdjustSlider } from './AdjustSlider';
import {
  AUTO_ENHANCE_ADJUSTMENTS,
  AUTO_REEL_ADJUSTMENTS,
  autoAdjustmentsFromStats,
  buildCssFilter,
  hasActiveEdits,
  isAdjustmentsNeutral,
  mergeAdjustments,
  snapSliderValue,
} from './filterEngine';
import {
  cropToAspect,
  exportErrorPhase,
  flipImage,
  nextFrame,
  renderEditedPhoto,
  rotateImage,
  sampleImageStats,
  straightenImage,
  warmPhotoEditorSource,
  type ExportPhase,
} from './imageProcessing';
import {
  EditorBusyOverlay,
  EditorLoadingState,
  EditorShell,
  EditorToolTabs,
  type EditorToolTab,
} from '../editorShell';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import type { FilterCategory } from './types';
import CropFrameOverlay from './CropFrameOverlay';
import DraggableTextOverlay from './DraggableTextOverlay';

const { width: SCREEN_W } = Dimensions.get('window');
const PREVIEW_H = Math.min(SCREEN_W * 1.05, 480);

const ALL_TABS: EditorToolTab<EditorTab>[] = [
  { id: 'looks', label: 'Looks', icon: 'color-filter-outline' },
  { id: 'adjust', label: 'Adjust', icon: 'options-outline' },
  { id: 'overlay', label: 'Text', icon: 'text-outline' },
  { id: 'crop', label: 'Crop', icon: 'crop-outline' },
  { id: 'tools', label: 'Tools', icon: 'construct-outline' },
];

const CROP_OPTIONS: { id: CropAspect; label: string }[] = [
  { id: 'free', label: 'Original' },
  { id: '1:1', label: '1:1' },
  { id: '4:5', label: '4:5' },
  { id: '3:2', label: '3:2' },
  { id: '2:3', label: '2:3' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
];

type AdjustKey = keyof EditAdjustments;

const ADJUST_SLIDERS: { key: AdjustKey; label: string; min: number; max: number }[] = [
  { key: 'exposure', label: 'Exposure', min: -40, max: 40 },
  { key: 'brightness', label: 'Brightness', min: -40, max: 40 },
  { key: 'contrast', label: 'Contrast', min: -40, max: 60 },
  { key: 'highlights', label: 'Highlights', min: -40, max: 40 },
  { key: 'shadows', label: 'Shadows', min: -40, max: 40 },
  { key: 'clarity', label: 'Clarity', min: -40, max: 40 },
  { key: 'saturation', label: 'Saturation', min: -80, max: 80 },
  { key: 'warmth', label: 'Warmth', min: -40, max: 40 },
  { key: 'tint', label: 'Tint', min: -40, max: 40 },
  { key: 'fade', label: 'Fade', min: 0, max: 50 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 50 },
  { key: 'cinematic', label: 'Cinematic edges', min: 0, max: 50 },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 50 },
  { key: 'grain', label: 'Grain', min: 0, max: 50 },
];

type EditorSnapshot = {
  workingUri: string;
  presetId: string | null;
  manualAdjust: EditAdjustments;
  straighten: number;
  cropAspect: CropAspect;
  cropOffsetX: number;
  cropOffsetY: number;
  overlays: TextOverlay[];
  activeOverlayId: string | null;
};

const HISTORY_LIMIT = 24;

type BusyState = { label: string; detail?: string; saving?: boolean };

const SAVE_PHASE_LABEL: Record<ExportPhase, string> = {
  geometry: 'Straightening & cropping…',
  read: 'Applying edits…',
  decode: 'Applying edits…',
  adjust: 'Applying edits…',
  encode: 'Saving photo…',
  write: 'Saving photo…',
};

const SAVE_FAILURE_COPY: Record<ExportPhase, string> = {
  geometry: "We couldn't straighten or crop this photo.",
  read: "We couldn't read the photo file.",
  decode: "This photo's format couldn't be processed.",
  adjust: 'Something went wrong while applying your look.',
  encode: "We couldn't encode the edited photo.",
  write: "We couldn't store the edited photo — your phone may be low on space.",
};

/** If expo-image never reports onLoad, don't keep the editor locked forever. */
const IMAGE_LOAD_GRACE_MS = 6000;

/** Cheap live grade — never jpeg-js while dragging. Pixel bake happens on Done. */
function LiveGradeOverlays({
  adj,
  comparing,
}: {
  adj: EditAdjustments;
  comparing: boolean;
}) {
  if (comparing) return null;
  const n = (v: number | undefined) => (Number.isFinite(v) ? (v as number) : 0);
  const lift = (n(adj.exposure) + n(adj.brightness)) / 90;
  const warmth = n(adj.warmth) / 70;
  const fade = Math.max(0, n(adj.fade)) / 140;
  const gray = Math.max(0, n(adj.grayscale)) / 150;
  const satLoss = Math.max(0, -n(adj.saturation)) / 140;
  return (
    <>
      {lift > 0.02 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(255,255,255,${Math.min(0.4, lift * 0.36)})` },
          ]}
        />
      ) : null}
      {lift < -0.02 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(0,0,0,${Math.min(0.48, -lift * 0.42)})` },
          ]}
        />
      ) : null}
      {warmth > 0.04 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(212,140,50,${Math.min(0.26, warmth * 0.2)})` },
          ]}
        />
      ) : null}
      {warmth < -0.04 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(60,110,190,${Math.min(0.26, -warmth * 0.2)})` },
          ]}
        />
      ) : null}
      {fade > 0.02 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(243,238,228,${Math.min(0.26, fade)})` },
          ]}
        />
      ) : null}
      {gray > 0.05 || satLoss > 0.08 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(120,120,120,${Math.min(0.42, gray + satLoss * 0.5)})` },
          ]}
        />
      ) : null}
    </>
  );
}

function newOverlay(text = 'GROW'): TextOverlay {
  return {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    x: 0.5,
    y: 0.5,
    color: '#FFFFFF',
    style: 'outline',
    scale: 1,
    align: 'center',
  };
}

function FilterThumb({
  uri,
  label,
  active,
  filterCss,
  onPress,
}: {
  uri: string | null;
  label: string;
  active: boolean;
  filterCss: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={tw`items-center mr-3`}
      accessibilityRole="button"
      accessibilityLabel={`${label} look`}
      accessibilityState={{ selected: active }}
    >
      <View
        style={[
          tw`w-[76px] h-[76px] rounded-2xl overflow-hidden`,
          active
            ? tw`border-2 border-brand-400`
            : tw`border border-stone-600`,
        ]}
      >
        <Image
          source={uri ? { uri } : null}
          style={[
            tw`w-full h-full bg-stone-900`,
            Platform.OS === 'web' && filterCss !== 'none' ? ({ filter: filterCss } as object) : null,
          ]}
          contentFit="cover"
        />
        {active && (
          <View style={tw`absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-brand-500 items-center justify-center border border-white/80`}>
            <Ionicons name="checkmark" size={12} color="#fff" />
          </View>
        )}
      </View>
      <Text
        style={tw`text-[11px] mt-2 text-center max-w-[76px] ${
          active ? 'text-brand-300 font-bold' : 'text-stone-400 font-medium'
        }`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function PhotoEditor({
  imageUri,
  onSave,
  onCancel,
  title = 'Edit photo',
  preferredAspect,
  enableOverlays = true,
}: PhotoEditorProps) {
  const originalUri = useRef(imageUri).current;
  const isVerticalClip = preferredAspect === '9:16';

  const tabs = useMemo(
    () => (enableOverlays ? ALL_TABS : ALL_TABS.filter((t) => t.id !== 'overlay')),
    [enableOverlays]
  );

  const [workingUri, setWorkingUri] = useState(imageUri);
  const [presetId, setPresetId] = useState<string | null>('original');
  const [manualAdjust, setManualAdjust] = useState<EditAdjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [activeTab, setActiveTab] = useState<EditorTab>('looks');
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('natural');
  const [selectedCrop, setSelectedCrop] = useState<CropAspect>('free');
  const [cropDirty, setCropDirty] = useState(false);
  const [cropOffsetX, setCropOffsetX] = useState(0);
  const [cropOffsetY, setCropOffsetY] = useState(0);
  const titleTaps = useRef({ n: 0, at: 0 });
  const [titleHint, setTitleHint] = useState('');
  const [straighten, setStraighten] = useState(0);
  const [overlays, setOverlays] = useState<TextOverlay[]>([]);
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyState | null>(null);
  const isProcessing = busy !== null;
  const reducedMotion = useReducedMotion();
  /** Light JPEG working copy of the picked photo (null while preparing). */
  const [baseUri, setBaseUri] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<'preparing' | 'ready' | 'failed'>('preparing');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [prepareAttempt, setPrepareAttempt] = useState(0);
  const editorReady = sourceStatus === 'ready' && imageLoaded;
  const controlsLocked = isProcessing || !editorReady;
  const [comparing, setComparing] = useState(false);
  const [history, setHistory] = useState<EditorSnapshot[]>([]);

  const cropOffsetRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const adjustHistoryArmed = useRef(true);
  const [previewSize, setPreviewSize] = useState({ w: SCREEN_W, h: PREVIEW_H });
  cropOffsetRef.current = { x: cropOffsetX, y: cropOffsetY };

  // Make (or reuse a pre-warmed) light JPEG working copy before showing the
  // photo: big HEIC originals are slow to decode and jpeg-js can't read them.
  useEffect(() => {
    let alive = true;
    setSourceStatus('preparing');
    setImageLoaded(false);
    warmPhotoEditorSource(originalUri)
      .then((copy) => {
        if (!alive) return;
        setBaseUri(copy.uri);
        setWorkingUri(copy.uri);
        setSourceStatus('ready');
      })
      .catch((error: unknown) => {
        // Show the existing "couldn't prepare" state (with retry) instead of spinning.
        console.warn('[PhotoEditor] could not prepare photo', error);
        if (alive) setSourceStatus('failed');
      });
    return () => {
      alive = false;
    };
  }, [originalUri, prepareAttempt]);

  useEffect(() => {
    if (sourceStatus !== 'ready' || imageLoaded) return;
    const t = setTimeout(() => setImageLoaded(true), IMAGE_LOAD_GRACE_MS);
    return () => clearTimeout(t);
  }, [sourceStatus, imageLoaded]);

  const onPreviewError = useCallback(() => {
    if (imageLoaded) return;
    // Working copy didn't render — try the original before giving up.
    if (workingUri !== originalUri) {
      setBaseUri(originalUri);
      setWorkingUri(originalUri);
      return;
    }
    setSourceStatus('failed');
  }, [imageLoaded, workingUri, originalUri]);

  const activeOverlay = overlays.find((o) => o.id === activeOverlayId) || null;

  const effective = useMemo(
    () => mergeAdjustments(presetId, manualAdjust),
    [presetId, manualAdjust]
  );
  const filterCss = useMemo(() => buildCssFilter(effective), [effective]);
  const isEdited =
    hasActiveEdits(manualAdjust, presetId) ||
    workingUri !== (baseUri ?? originalUri) ||
    Math.abs(straighten) >= 0.4 ||
    overlays.some((o) => o.text.trim()) ||
    (selectedCrop !== 'free' && (cropOffsetX !== 0 || cropOffsetY !== 0));

  const visiblePresets = useMemo(
    () => getPresetsForCategory(activeCategory),
    [activeCategory]
  );

  const pushHistory = useCallback(() => {
    setHistory((prev) => {
      const snap: EditorSnapshot = {
        workingUri,
        presetId,
        manualAdjust: { ...manualAdjust },
        straighten,
        cropAspect: selectedCrop,
        cropOffsetX,
        cropOffsetY,
        overlays: overlays.map((o) => ({ ...o })),
        activeOverlayId,
      };
      return [...prev.slice(-(HISTORY_LIMIT - 1)), snap];
    });
  }, [
    workingUri,
    presetId,
    manualAdjust,
    straighten,
    selectedCrop,
    cropOffsetX,
    cropOffsetY,
    overlays,
    activeOverlayId,
  ]);

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setWorkingUri(last.workingUri);
      setPresetId(last.presetId);
      setManualAdjust(last.manualAdjust);
      setStraighten(last.straighten);
      setSelectedCrop(last.cropAspect);
      setCropOffsetX(last.cropOffsetX);
      setCropOffsetY(last.cropOffsetY);
      setOverlays(last.overlays);
      setActiveOverlayId(last.activeOverlayId);
      return prev.slice(0, -1);
    });
  }, []);

  const setAdjust = useCallback((key: AdjustKey, value: number) => {
    const snapped = snapSliderValue(value);
    setManualAdjust((prev) => {
      if (prev[key] === snapped) return prev;
      return { ...prev, [key]: snapped };
    });
  }, []);

  const resetLooksAndAdjust = useCallback(() => {
    pushHistory();
    setPresetId('original');
    setManualAdjust({ ...DEFAULT_ADJUSTMENTS });
  }, [pushHistory]);

  const applyAuto = useCallback(async () => {
    pushHistory();
    feedback.autoLook();
    setBusy({ label: 'Reading the light…' });
    try {
      const stats = await sampleImageStats(workingUri);
      setPresetId('original');
      setManualAdjust(autoAdjustmentsFromStats(stats, isVerticalClip));
    } catch {
      setPresetId('original');
      setManualAdjust({
        ...(isVerticalClip ? AUTO_REEL_ADJUSTMENTS : AUTO_ENHANCE_ADJUSTMENTS),
      });
    } finally {
      setBusy(null);
    }
  }, [pushHistory, isVerticalClip, workingUri]);

  const handleSave = useCallback(async () => {
    if (controlsLocked) return;
    const liveOverlays = overlays.filter((o) => o.text.trim());
    const needsStraighten = Math.abs(straighten) >= 0.4;
    const needsCrop = selectedCrop !== 'free' && cropDirty;
    const needsPixel = !isAdjustmentsNeutral(effective) || liveOverlays.length > 0;

    if (!needsStraighten && !needsCrop && !needsPixel) {
      triggerFeedback('commit', SILENT);
      // Untouched → hand back the original, not our downscaled working copy.
      onSave(workingUri === baseUri ? originalUri : workingUri);
      return;
    }

    triggerFeedback('commit', SILENT);
    setBusy({ label: 'Applying edits…', detail: 'Keep the app open', saving: true });
    // Let the overlay paint before native / JS work starts.
    await nextFrame();
    try {
      const uri = await renderEditedPhoto(workingUri, {
        geometry: {
          straighten: needsStraighten ? straighten : 0,
          crop: needsCrop ? selectedCrop : 'free',
          offsetX: cropOffsetX,
          offsetY: cropOffsetY,
        },
        adjustments: effective,
        overlays: liveOverlays,
        onPhase: (phase) =>
          setBusy({ label: SAVE_PHASE_LABEL[phase], detail: 'Keep the app open', saving: true }),
      });
      setBusy(null);
      onSave(uri);
    } catch (err) {
      setBusy(null);
      if (__DEV__) console.warn('[PhotoEditor] export failed', err);
      const phase = exportErrorPhase(err);
      const what = phase ? SAVE_FAILURE_COPY[phase] : "We couldn't apply your edits.";
      // Edits stay in state, so Done simply retries.
      void alertMessage(
        "Couldn't save your edits",
        `${what} Your edits are still here — tap Done to try again.`
      );
    }
  }, [
    controlsLocked,
    workingUri,
    baseUri,
    originalUri,
    effective,
    onSave,
    straighten,
    selectedCrop,
    cropDirty,
    cropOffsetX,
    cropOffsetY,
    overlays,
  ]);

  const handleRotate = useCallback(async () => {
    pushHistory();
    setBusy({ label: 'Rotating…' });
    try {
      const next = await rotateImage(workingUri);
      setWorkingUri(next);
      setCropOffsetX(0);
      setCropOffsetY(0);
    } catch {
      alertMessage('Error', 'Could not rotate image.');
    } finally {
      setBusy(null);
    }
  }, [workingUri, pushHistory]);

  const handleFlip = useCallback(
    async (dir: 'horizontal' | 'vertical') => {
      pushHistory();
      setBusy({ label: 'Flipping…' });
      try {
        const next = await flipImage(workingUri, dir);
        setWorkingUri(next);
      } catch {
        alertMessage('Error', 'Could not flip image.');
      } finally {
        setBusy(null);
      }
    },
    [workingUri, pushHistory]
  );

  const commitStraighten = useCallback(async () => {
    if (Math.abs(straighten) < 0.4) return;
    pushHistory();
    setBusy({ label: 'Straightening…' });
    try {
      const next = await straightenImage(workingUri, straighten);
      setWorkingUri(next);
      setStraighten(0);
    } catch {
      alertMessage('Error', 'Could not straighten image.');
    } finally {
      setBusy(null);
    }
  }, [workingUri, straighten, pushHistory]);

  const applyCropNow = useCallback(async () => {
    if (selectedCrop === 'free') return;
    pushHistory();
    triggerFeedback('commit', SILENT);
    setBusy({ label: 'Cropping…' });
    try {
      let uri = workingUri;
      if (Math.abs(straighten) >= 0.4) {
        uri = await straightenImage(uri, straighten);
        setStraighten(0);
      }
      const next = await cropToAspect(uri, selectedCrop, cropOffsetX, cropOffsetY);
      setWorkingUri(next);
      setSelectedCrop('free');
      setCropDirty(false);
      setCropOffsetX(0);
      setCropOffsetY(0);
    } catch {
      alertMessage('Error', 'Could not crop image.');
    } finally {
      setBusy(null);
    }
  }, [workingUri, selectedCrop, cropOffsetX, cropOffsetY, straighten, pushHistory]);

  const addTextOverlay = useCallback(
    (text?: string) => {
      if (overlays.length >= MAX_TEXT_OVERLAYS) {
        void alertMessage(
          'Text limit reached',
          `You can add up to ${MAX_TEXT_OVERLAYS} text layers. Remove one to add another.`
        );
        return;
      }
      pushHistory();
      const o = newOverlay(text || 'GROW');
      setOverlays((prev) => [...prev, o]);
      setActiveOverlayId(o.id);
      setActiveTab('overlay');
    },
    [overlays.length, pushHistory]
  );

  const updateActiveOverlay = useCallback(
    (patch: Partial<TextOverlay>) => {
      if (!activeOverlayId) return;
      setOverlays((prev) =>
        prev.map((o) => (o.id === activeOverlayId ? { ...o, ...patch } : o))
      );
    },
    [activeOverlayId]
  );

  const removeActiveOverlay = useCallback(() => {
    if (!activeOverlayId) return;
    pushHistory();
    setOverlays((prev) => prev.filter((o) => o.id !== activeOverlayId));
    setActiveOverlayId(null);
  }, [activeOverlayId, pushHistory]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => activeTab === 'crop' && selectedCrop !== 'free',
        onMoveShouldSetPanResponder: () => activeTab === 'crop' && selectedCrop !== 'free',
        onPanResponderGrant: () => {
          panStartRef.current = { ...cropOffsetRef.current };
        },
        onPanResponderMove: (_evt, gesture) => {
          if (activeTab === 'crop' && selectedCrop !== 'free') {
            const nextX = Math.max(-1, Math.min(1, panStartRef.current.x + gesture.dx / 140));
            const nextY = Math.max(-1, Math.min(1, panStartRef.current.y + gesture.dy / 140));
            setCropOffsetX(nextX);
            setCropOffsetY(nextY);
            setCropDirty(true);
          }
        },
      }),
    [activeTab, selectedCrop]
  );

  const previewUri = comparing ? baseUri ?? originalUri : workingUri;
  const previewStyle =
    Platform.OS === 'web' && !comparing && filterCss !== 'none'
      ? ({ filter: filterCss } as object)
      : undefined;
  const vignetteOpacity = comparing ? 0 : Math.min(0.65, effective.vignette / 70);
  const cinematicOpacity = comparing ? 0 : Math.min(0.55, effective.cinematic / 90);
  const previewTransform = [
    { translateX: activeTab === 'crop' ? cropOffsetX * 28 : 0 },
    { translateY: activeTab === 'crop' ? cropOffsetY * 28 : 0 },
    { rotate: `${comparing ? 0 : straighten}deg` },
    { scale: Math.abs(straighten) > 0.4 && !comparing ? 1.08 : 1 },
  ];
  const showPanHandlers = activeTab === 'crop' && selectedCrop !== 'free';

  const hasUnsavedChanges = isEdited || cropDirty || history.length > 0;
  const saving = Boolean(busy?.saving);

  const onTitlePress = useCallback(() => {
    const now = Date.now();
    if (now - titleTaps.current.at > 2800) titleTaps.current.n = 0;
    titleTaps.current.at = now;
    titleTaps.current.n += 1;
    if (titleTaps.current.n >= 5) {
      titleTaps.current.n = 0;
      feedback.egg();
      setTitleHint('Look closer.');
      setTimeout(() => setTitleHint(''), 1400);
    }
  }, []);

  const onDone = useCallback(() => {
    void handleSave();
  }, [handleSave]);

  const onLoadingClose = useCallback(() => {
    feedback.close();
    onCancel();
  }, [onCancel]);

  const onLoadingRetry = useCallback(() => setPrepareAttempt((n) => n + 1), []);

  const subtitle = comparing
    ? 'Original'
    : isEdited && !titleHint
      ? 'Looks apply on Done'
      : undefined;

  const toolbar = (
    <View style={tw`flex-row items-center justify-between px-4 py-2 bg-stone-900/80`}>
      <Pressable
        onPress={handleUndo}
        disabled={history.length === 0 || controlsLocked}
        accessibilityRole="button"
        accessibilityLabel="Undo"
        accessibilityState={{ disabled: history.length === 0 || controlsLocked }}
        style={tw`flex-row items-center gap-1.5 px-2 py-1 ${
          history.length === 0 ? 'opacity-35' : ''
        }`}
        hitSlop={8}
      >
        <Ionicons name="arrow-undo-outline" size={18} color="#A8A29E" />
        <Text style={tw`text-stone-400 text-xs`}>Undo</Text>
      </Pressable>

      <Pressable
        onPress={() => void applyAuto()}
        disabled={controlsLocked}
        accessibilityRole="button"
        accessibilityLabel="Auto enhance"
        style={tw`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-800`}
        hitSlop={8}
      >
        <Ionicons name="sparkles-outline" size={16} color="#34D399" />
        <Text style={tw`text-brand-400 text-xs font-semibold`}>Auto</Text>
      </Pressable>

      <Pressable
        onPressIn={() => setComparing(true)}
        onPressOut={() => setComparing(false)}
        disabled={controlsLocked}
        accessibilityRole="button"
        accessibilityLabel="Compare with original"
        accessibilityHint="Press and hold to see the original photo"
        style={tw`flex-row items-center gap-1.5 px-2 py-1`}
        hitSlop={8}
      >
        <Ionicons name="eye-outline" size={18} color={comparing ? '#FBBF24' : '#A8A29E'} />
        <Text style={tw`text-xs ${comparing ? 'text-amber-400' : 'text-stone-400'}`}>
          Compare
        </Text>
      </Pressable>
    </View>
  );

  const stage = (
    <>
      <View
        style={[tw`items-center justify-center bg-black overflow-hidden`, { height: PREVIEW_H }]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) setPreviewSize({ w: width, h: height });
        }}
        {...(showPanHandlers ? panResponder.panHandlers : {})}
      >
        <View style={tw`relative w-full h-full`}>
          {sourceStatus === 'ready' ? (
            <Image
              source={{ uri: previewUri }}
              style={[
                tw`w-full h-full`,
                previewStyle,
                { transform: previewTransform, backgroundColor: '#000' },
              ]}
              contentFit="contain"
              // Fade in only on first appearance; looks/compare stay instant.
              transition={imageLoaded || reducedMotion ? 0 : 180}
              priority="high"
              onLoad={() => setImageLoaded(true)}
              onError={onPreviewError}
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <LiveGradeOverlays adj={effective} comparing={comparing} />
          {vignetteOpacity > 0 && (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: `rgba(0,0,0,${vignetteOpacity * 0.35})` },
              ]}
            />
          )}
          {cinematicOpacity > 0 && (
            <>
              <View
                pointerEvents="none"
                style={[
                  tw`absolute left-0 right-0 top-0`,
                  { height: PREVIEW_H * 0.18, backgroundColor: `rgba(0,0,0,${cinematicOpacity})` },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  tw`absolute left-0 right-0 bottom-0`,
                  { height: PREVIEW_H * 0.22, backgroundColor: `rgba(0,0,0,${cinematicOpacity})` },
                ]}
              />
            </>
          )}
          {!comparing &&
            overlays.map((o) =>
              o.text.trim() ? (
                <DraggableTextOverlay
                  key={o.id}
                  overlay={o}
                  selected={activeOverlayId === o.id}
                  containerW={previewSize.w}
                  containerH={previewSize.h}
                  editable={!isProcessing}
                  onSelect={() => {
                    setActiveOverlayId(o.id);
                    setActiveTab('overlay');
                  }}
                  onMove={(x, y) => {
                    setOverlays((prev) =>
                      prev.map((item) => (item.id === o.id ? { ...item, x, y } : item))
                    );
                  }}
                />
              ) : null
            )}
          {activeTab === 'crop' && selectedCrop !== 'free' && (
            <CropFrameOverlay
              aspect={selectedCrop}
              containerW={SCREEN_W}
              containerH={PREVIEW_H}
            />
          )}
          {!editorReady && (
            <EditorLoadingState
              subject="photo"
              status={sourceStatus === 'failed' ? 'failed' : 'preparing'}
              width={previewSize.w}
              height={previewSize.h}
              aspect={preferredAspect}
              reducedMotion={reducedMotion}
              onRetry={onLoadingRetry}
              onClose={onLoadingClose}
            />
          )}
          {/* Saving uses the shell's full-screen overlay; other busy work stays on the stage. */}
          {busy && !busy.saving && <EditorBusyOverlay label={busy.label} detail={busy.detail} />}
        </View>
      </View>

      {activeTab === 'crop' && selectedCrop !== 'free' && (
        <Text style={tw`text-center text-stone-400 text-[11px] py-1.5 bg-black`}>
          Drag to reframe · Apply Crop when ready
        </Text>
      )}
      {activeTab === 'overlay' && activeOverlay && (
        <Text style={tw`text-center text-stone-400 text-[11px] py-1.5 bg-black`}>
          Press and drag the text to place it anywhere
        </Text>
      )}
    </>
  );

  return (
    <EditorShell
      title={titleHint || title}
      subtitle={subtitle}
      subtitleTone={comparing ? 'amber' : 'brand'}
      onTitlePress={onTitlePress}
      hasUnsavedChanges={hasUnsavedChanges}
      discardMessage="Your changes to this photo will be lost."
      onCancel={onCancel}
      closeDisabled={isProcessing}
      onDone={onDone}
      doneDisabled={controlsLocked}
      saving={saving}
      savingLabel={busy?.label}
      savingDetail={busy?.detail}
      toolbar={toolbar}
      stage={stage}
      tools={
        <EditorToolTabs
          tabs={tabs}
          value={activeTab}
          onChange={setActiveTab}
          disabled={controlsLocked}
          dimmed={!editorReady}
        />
      }
    >
        <View
          style={[tw`flex-1 bg-stone-900`, !editorReady && { opacity: 0.5 }]}
          pointerEvents={controlsLocked ? 'none' : 'auto'}
          accessibilityElementsHidden={controlsLocked}
          importantForAccessibility={controlsLocked ? 'no-hide-descendants' : 'auto'}
        >
          {activeTab === 'looks' && (
            <View style={tw`flex-1 pt-1`}>
              <FilterCategoryBar
                active={activeCategory}
                onSelect={(id) => {
                  triggerFeedback('tab', SILENT);
                  setActiveCategory(id);
                }}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={tw`px-4 py-3`}
              >
                {visiblePresets.map((preset) => {
                  const thumbFilter = buildCssFilter(
                    mergeAdjustments(preset.id, { ...DEFAULT_ADJUSTMENTS })
                  );
                  return (
                    <FilterThumb
                      key={preset.id}
                      uri={editorReady ? workingUri : null}
                      label={preset.label}
                      active={presetId === preset.id}
                      filterCss={thumbFilter}
                      onPress={() => {
                        feedback.filter();
                        if (presetId !== preset.id) pushHistory();
                        setPresetId(preset.id);
                      }}
                    />
                  );
                })}
              </ScrollView>
            </View>
          )}

          {activeTab === 'adjust' && (
            <ScrollView style={tw`flex-1 px-4 pt-3`} showsVerticalScrollIndicator={false}>
              {ADJUST_SLIDERS.map((s) => (
                <AdjustSlider
                  key={s.key}
                  label={s.label}
                  value={manualAdjust[s.key]}
                  min={s.min}
                  max={s.max}
                  onSlidingStart={() => {
                    if (adjustHistoryArmed.current) {
                      pushHistory();
                      adjustHistoryArmed.current = false;
                    }
                  }}
                  onChange={(v) => setAdjust(s.key, v)}
                  onSlidingComplete={() => {
                    adjustHistoryArmed.current = true;
                    feedback.select();
                  }}
                />
              ))}
              <Pressable
                onPress={() => {
                  feedback.toggle();
                  resetLooksAndAdjust();
                }}
                style={tw`self-center py-2 px-6 mb-4`}
              >
                <Text style={tw`text-brand-400 font-semibold text-sm`}>Reset looks & adjust</Text>
              </Pressable>
            </ScrollView>
          )}

          {activeTab === 'overlay' && enableOverlays && (
            <TextOverlayPanel
              overlays={overlays}
              activeOverlay={activeOverlay}
              cinematic={manualAdjust.cinematic}
              onSelectOverlay={setActiveOverlayId}
              onAdd={(text) => addTextOverlay(text)}
              onUpdate={updateActiveOverlay}
              onRemove={removeActiveOverlay}
              onCinematicChange={(v) => setAdjust('cinematic', v)}
            />
          )}

          {activeTab === 'crop' && (
            <View style={tw`flex-1 px-4 pt-4`}>
              <Text style={tw`text-stone-400 text-sm mb-3`}>
                Choose a ratio, drag the photo to reframe, then apply.
                {preferredAspect ? ` Suggested ${preferredAspect}.` : ''}
              </Text>
              <View style={tw`flex-row flex-wrap gap-2 mb-4`}>
                {CROP_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.id}
                    onPress={() => {
                      pushHistory();
                      setSelectedCrop(opt.id);
                      setCropDirty(opt.id !== 'free');
                      if (opt.id === 'free') {
                        setCropOffsetX(0);
                        setCropOffsetY(0);
                      }
                    }}
                    disabled={isProcessing}
                    accessibilityRole="button"
                    accessibilityLabel={`Crop ${opt.label}`}
                    accessibilityState={{ selected: selectedCrop === opt.id, disabled: isProcessing }}
                    style={tw`px-3.5 py-2.5 rounded-xl border ${
                      selectedCrop === opt.id
                        ? 'bg-brand-600 border-brand-500'
                        : 'bg-stone-800 border-stone-700'
                    } ${isProcessing ? 'opacity-60' : ''}`}
                  >
                    <Text
                      style={tw`font-semibold text-sm ${
                        selectedCrop === opt.id ? 'text-white' : 'text-stone-300'
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {selectedCrop !== 'free' && (
                <Pressable
                  onPress={() => void applyCropNow()}
                  disabled={isProcessing}
                  accessibilityRole="button"
                  accessibilityLabel="Apply crop"
                  style={tw`self-start flex-row items-center gap-2 bg-brand-600 px-4 py-3 rounded-xl`}
                >
                  <Ionicons name="crop" size={18} color="#fff" />
                  <Text style={tw`text-white font-semibold`}>Apply Crop</Text>
                </Pressable>
              )}
            </View>
          )}

          {activeTab === 'tools' && (
            <ScrollView style={tw`flex-1 px-4 pt-4`} showsVerticalScrollIndicator={false}>
              <View style={tw`flex-row justify-around mb-6`}>
                {[
                  { icon: 'refresh' as const, label: 'Rotate 90°', onPress: handleRotate },
                  {
                    icon: 'swap-horizontal' as const,
                    label: 'Flip H',
                    onPress: () => handleFlip('horizontal'),
                  },
                  {
                    icon: 'swap-vertical' as const,
                    label: 'Flip V',
                    onPress: () => handleFlip('vertical'),
                  },
                ].map((action) => (
                  <Pressable
                    key={action.label}
                    onPress={() => void action.onPress()}
                    disabled={isProcessing}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    style={tw`items-center`}
                  >
                    <View
                      style={tw`w-14 h-14 rounded-2xl bg-stone-800 items-center justify-center mb-2`}
                    >
                      <Ionicons name={action.icon} size={26} color="#FFFFFF" />
                    </View>
                    <Text style={tw`text-stone-400 text-xs`}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={tw`text-stone-300 text-sm font-medium mb-1`}>Straighten</Text>
              <View style={tw`flex-row justify-between mb-1`}>
                <Text style={tw`text-stone-400 text-xs`}>−15°</Text>
                <Text style={tw`text-stone-400 text-sm`}>{straighten.toFixed(0)}°</Text>
                <Text style={tw`text-stone-400 text-xs`}>+15°</Text>
              </View>
              <Slider
                accessibilityLabel="Straighten"
                style={tw`w-full h-8 mb-3`}
                minimumValue={-15}
                maximumValue={15}
                value={straighten}
                onValueChange={(v) => setStraighten(Math.round(v))}
                minimumTrackTintColor="#059669"
                maximumTrackTintColor="#44403C"
                thumbTintColor="#10B981"
                step={1}
              />
              {Math.abs(straighten) >= 1 && (
                <Pressable
                  onPress={() => void commitStraighten()}
                  disabled={isProcessing}
                  accessibilityRole="button"
                  accessibilityLabel="Apply straighten"
                  style={tw`self-start flex-row items-center gap-2 bg-stone-800 px-4 py-2.5 rounded-xl mb-6`}
                >
                  <Ionicons name="checkmark" size={18} color="#34D399" />
                  <Text style={tw`text-brand-400 font-semibold text-sm`}>Apply straighten</Text>
                </Pressable>
              )}
            </ScrollView>
          )}
        </View>
    </EditorShell>
  );
}
