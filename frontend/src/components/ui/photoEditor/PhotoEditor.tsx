import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  PanResponder,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import tw from '../../../lib/tw';
import { alertMessage } from '../../../utils/confirmDialog';
import type {
  CropAspect,
  EditAdjustments,
  EditorTab,
  PhotoEditorProps,
  TextOverlay,
  TextOverlayStyle,
} from './types';
import { DEFAULT_ADJUSTMENTS, TEXT_COLORS } from './types';
import { FILTER_CATEGORIES, getPresetsForCategory } from './presets';
import {
  AUTO_ENHANCE_ADJUSTMENTS,
  AUTO_REEL_ADJUSTMENTS,
  buildCssFilter,
  hasActiveEdits,
  mergeAdjustments,
  snapSliderValue,
} from './filterEngine';
import {
  cropToAspect,
  exportEditedImage,
  flipImage,
  rotateImage,
  straightenImage,
} from './imageProcessing';
import type { FilterCategory } from './types';
import CropFrameOverlay from './CropFrameOverlay';

const { width: SCREEN_W } = Dimensions.get('window');
const PREVIEW_H = Math.min(SCREEN_W * 1.05, 480);

const ALL_TABS: { id: EditorTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
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

const TEXT_STYLES: { id: TextOverlayStyle; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'bold', label: 'Bold' },
  { id: 'outline', label: 'Outline' },
  { id: 'pill', label: 'Pill' },
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

function newOverlay(): TextOverlay {
  return {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: 'GROW',
    x: 0.5,
    y: 0.5,
    color: '#FFFFFF',
    style: 'outline',
    scale: 1,
  };
}

function FilterThumb({
  uri,
  label,
  active,
  filterCss,
  onPress,
}: {
  uri: string;
  label: string;
  active: boolean;
  filterCss: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={tw`items-center mr-3`}>
      <View
        style={tw`w-[72px] h-[72px] rounded-xl overflow-hidden border-2 ${
          active ? 'border-brand-500' : 'border-stone-700'
        }`}
      >
        <Image
          source={{ uri }}
          style={[tw`w-full h-full`, filterCss !== 'none' ? ({ filter: filterCss } as object) : null]}
          contentFit="cover"
        />
      </View>
      <Text
        style={tw`text-[10px] mt-1.5 text-center ${
          active ? 'text-brand-400 font-semibold' : 'text-stone-400'
        }`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function AdjustSlider({
  label,
  value,
  min,
  max,
  onChange,
  onSlidingStart,
  onSlidingComplete,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onSlidingStart?: () => void;
  onSlidingComplete?: () => void;
}) {
  const displayValue = snapSliderValue(value);
  const handleChange = (raw: number) => {
    const snapped = snapSliderValue(raw);
    if (snapped !== displayValue) onChange(snapped);
  };

  return (
    <View style={tw`mb-4`}>
      <View style={tw`flex-row justify-between mb-1`}>
        <Text style={tw`text-stone-300 text-sm font-medium`}>{label}</Text>
        <Text style={tw`text-stone-500 text-sm`}>{displayValue}</Text>
      </View>
      <Slider
        style={tw`w-full h-8`}
        minimumValue={min}
        maximumValue={max}
        value={displayValue}
        onSlidingStart={onSlidingStart}
        onValueChange={handleChange}
        onSlidingComplete={(raw) => {
          handleChange(raw);
          onSlidingComplete?.();
        }}
        minimumTrackTintColor="#059669"
        maximumTrackTintColor="#44403C"
        thumbTintColor="#10B981"
        step={1}
      />
    </View>
  );
}

export default function PhotoEditor({
  imageUri,
  onSave,
  onCancel,
  title = 'Edit Photo',
  preferredAspect,
  enableOverlays = true,
}: PhotoEditorProps) {
  const insets = useSafeAreaInsets();
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
  const [selectedCrop, setSelectedCrop] = useState<CropAspect>(preferredAspect ?? 'free');
  const [cropOffsetX, setCropOffsetX] = useState(0);
  const [cropOffsetY, setCropOffsetY] = useState(0);
  const [straighten, setStraighten] = useState(0);
  const [overlays, setOverlays] = useState<TextOverlay[]>([]);
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [history, setHistory] = useState<EditorSnapshot[]>([]);

  const cropOffsetRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const adjustHistoryArmed = useRef(true);
  const textDragStart = useRef({ x: 0.5, y: 0.5 });
  cropOffsetRef.current = { x: cropOffsetX, y: cropOffsetY };

  const activeOverlay = overlays.find((o) => o.id === activeOverlayId) || null;

  const effective = useMemo(
    () => mergeAdjustments(presetId, manualAdjust),
    [presetId, manualAdjust]
  );
  const filterCss = useMemo(() => buildCssFilter(effective), [effective]);
  const isEdited =
    hasActiveEdits(manualAdjust, presetId) ||
    workingUri !== originalUri ||
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

  const applyAuto = useCallback(() => {
    pushHistory();
    setPresetId('original');
    setManualAdjust({
      ...(isVerticalClip ? AUTO_REEL_ADJUSTMENTS : AUTO_ENHANCE_ADJUSTMENTS),
    });
  }, [pushHistory, isVerticalClip]);

  const handleSave = useCallback(async () => {
    setIsProcessing(true);
    try {
      let uri = workingUri;
      if (Math.abs(straighten) >= 0.4) {
        uri = await straightenImage(uri, straighten);
      }
      if (selectedCrop !== 'free') {
        uri = await cropToAspect(uri, selectedCrop, cropOffsetX, cropOffsetY);
      }
      const exported = await exportEditedImage(uri, effective, {
        overlays: overlays.filter((o) => o.text.trim()),
      });
      onSave(exported);
    } catch {
      alertMessage('Export failed', 'Could not apply edits. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [
    workingUri,
    effective,
    onSave,
    straighten,
    selectedCrop,
    cropOffsetX,
    cropOffsetY,
    overlays,
  ]);

  const handleRotate = useCallback(async () => {
    pushHistory();
    setIsProcessing(true);
    try {
      const next = await rotateImage(workingUri);
      setWorkingUri(next);
      setCropOffsetX(0);
      setCropOffsetY(0);
    } catch {
      alertMessage('Error', 'Could not rotate image.');
    } finally {
      setIsProcessing(false);
    }
  }, [workingUri, pushHistory]);

  const handleFlip = useCallback(
    async (dir: 'horizontal' | 'vertical') => {
      pushHistory();
      setIsProcessing(true);
      try {
        const next = await flipImage(workingUri, dir);
        setWorkingUri(next);
      } catch {
        alertMessage('Error', 'Could not flip image.');
      } finally {
        setIsProcessing(false);
      }
    },
    [workingUri, pushHistory]
  );

  const commitStraighten = useCallback(async () => {
    if (Math.abs(straighten) < 0.4) return;
    pushHistory();
    setIsProcessing(true);
    try {
      const next = await straightenImage(workingUri, straighten);
      setWorkingUri(next);
      setStraighten(0);
    } catch {
      alertMessage('Error', 'Could not straighten image.');
    } finally {
      setIsProcessing(false);
    }
  }, [workingUri, straighten, pushHistory]);

  const applyCropNow = useCallback(async () => {
    if (selectedCrop === 'free') return;
    pushHistory();
    setIsProcessing(true);
    try {
      let uri = workingUri;
      if (Math.abs(straighten) >= 0.4) {
        uri = await straightenImage(uri, straighten);
        setStraighten(0);
      }
      const next = await cropToAspect(uri, selectedCrop, cropOffsetX, cropOffsetY);
      setWorkingUri(next);
      setSelectedCrop('free');
      setCropOffsetX(0);
      setCropOffsetY(0);
    } catch {
      alertMessage('Error', 'Could not crop image.');
    } finally {
      setIsProcessing(false);
    }
  }, [workingUri, selectedCrop, cropOffsetX, cropOffsetY, straighten, pushHistory]);

  const addTextOverlay = useCallback(() => {
    pushHistory();
    const o = newOverlay();
    setOverlays((prev) => [...prev.slice(0, 4), o]);
    setActiveOverlayId(o.id);
    setActiveTab('overlay');
  }, [pushHistory]);

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
        onStartShouldSetPanResponder: () =>
          (activeTab === 'crop' && selectedCrop !== 'free') ||
          (activeTab === 'overlay' && !!activeOverlayId),
        onMoveShouldSetPanResponder: () =>
          (activeTab === 'crop' && selectedCrop !== 'free') ||
          (activeTab === 'overlay' && !!activeOverlayId),
        onPanResponderGrant: () => {
          if (activeTab === 'crop') {
            panStartRef.current = { ...cropOffsetRef.current };
          } else if (activeOverlay) {
            textDragStart.current = { x: activeOverlay.x, y: activeOverlay.y };
          }
        },
        onPanResponderMove: (_evt, gesture) => {
          if (activeTab === 'crop' && selectedCrop !== 'free') {
            const nextX = Math.max(-1, Math.min(1, panStartRef.current.x + gesture.dx / 140));
            const nextY = Math.max(-1, Math.min(1, panStartRef.current.y + gesture.dy / 140));
            setCropOffsetX(nextX);
            setCropOffsetY(nextY);
            return;
          }
          if (activeTab === 'overlay' && activeOverlayId) {
            const nextX = Math.max(0.08, Math.min(0.92, textDragStart.current.x + gesture.dx / SCREEN_W));
            const nextY = Math.max(0.08, Math.min(0.92, textDragStart.current.y + gesture.dy / PREVIEW_H));
            setOverlays((prev) =>
              prev.map((o) => (o.id === activeOverlayId ? { ...o, x: nextX, y: nextY } : o))
            );
          }
        },
      }),
    [activeTab, selectedCrop, activeOverlayId, activeOverlay]
  );

  const previewUri = comparing ? originalUri : workingUri;
  const previewStyle =
    !comparing && filterCss !== 'none' ? ({ filter: filterCss } as object) : undefined;
  const vignetteOpacity = comparing ? 0 : Math.min(0.65, effective.vignette / 70);
  const cinematicOpacity = comparing ? 0 : Math.min(0.55, effective.cinematic / 90);
  const previewTransform = [
    { translateX: activeTab === 'crop' ? cropOffsetX * 28 : 0 },
    { translateY: activeTab === 'crop' ? cropOffsetY * 28 : 0 },
    { rotate: `${comparing ? 0 : straighten}deg` },
    { scale: Math.abs(straighten) > 0.4 && !comparing ? 1.08 : 1 },
  ];
  const showPanHandlers = activeTab === 'crop' || activeTab === 'overlay';

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={tw`flex-1 bg-stone-950`} edges={['top', 'bottom']}>
        <View
          style={[
            tw`flex-row items-center justify-between px-4 border-b border-stone-800`,
            { paddingTop: Math.max(insets.top, 4), paddingBottom: 10 },
          ]}
        >
          <Pressable onPress={onCancel} disabled={isProcessing} hitSlop={12}>
            <Text style={tw`text-stone-300 text-base`}>Cancel</Text>
          </Pressable>
          <View style={tw`items-center flex-1 px-2`}>
            <Text style={tw`text-white text-base font-bold`} numberOfLines={1}>
              {title}
            </Text>
            {isEdited && !comparing && (
              <Text style={tw`text-brand-400 text-[10px] mt-0.5`}>Edited</Text>
            )}
            {comparing && <Text style={tw`text-amber-400 text-[10px] mt-0.5`}>Original</Text>}
          </View>
          <Pressable onPress={handleSave} disabled={isProcessing} hitSlop={12}>
            <Text
              style={tw`${isProcessing ? 'text-stone-600' : 'text-brand-400'} text-base font-bold`}
            >
              {isProcessing ? 'Saving…' : 'Done'}
            </Text>
          </Pressable>
        </View>

        <View style={tw`flex-row items-center justify-between px-4 py-2 bg-stone-900/80`}>
          <Pressable
            onPress={handleUndo}
            disabled={history.length === 0 || isProcessing}
            style={tw`flex-row items-center gap-1.5 px-2 py-1 ${
              history.length === 0 ? 'opacity-35' : ''
            }`}
            hitSlop={8}
          >
            <Ionicons name="arrow-undo-outline" size={18} color="#A8A29E" />
            <Text style={tw`text-stone-400 text-xs`}>Undo</Text>
          </Pressable>

          <Pressable
            onPress={applyAuto}
            disabled={isProcessing}
            style={tw`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-800`}
            hitSlop={8}
          >
            <Ionicons name="sparkles-outline" size={16} color="#34D399" />
            <Text style={tw`text-brand-400 text-xs font-semibold`}>Auto</Text>
          </Pressable>

          <Pressable
            onPressIn={() => setComparing(true)}
            onPressOut={() => setComparing(false)}
            disabled={isProcessing}
            style={tw`flex-row items-center gap-1.5 px-2 py-1`}
            hitSlop={8}
          >
            <Ionicons name="eye-outline" size={18} color={comparing ? '#FBBF24' : '#A8A29E'} />
            <Text style={tw`text-xs ${comparing ? 'text-amber-400' : 'text-stone-400'}`}>
              Compare
            </Text>
          </Pressable>
        </View>

        <View
          style={[tw`items-center justify-center bg-black overflow-hidden`, { height: PREVIEW_H }]}
          {...(showPanHandlers ? panResponder.panHandlers : {})}
        >
          <View style={tw`relative w-full h-full`}>
            <Image
              source={{ uri: previewUri }}
              style={[tw`w-full h-full`, previewStyle, { transform: previewTransform }]}
              contentFit="contain"
              transition={120}
            />
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
                  <View
                    key={o.id}
                    pointerEvents="none"
                    style={[
                      tw`absolute px-2 py-1`,
                      {
                        left: `${o.x * 100}%`,
                        top: `${o.y * 100}%`,
                        transform: [
                          { translateX: -40 },
                          { translateY: -14 },
                          { scale: o.scale },
                        ],
                        backgroundColor:
                          o.style === 'pill' ? 'rgba(0,0,0,0.55)' : 'transparent',
                        borderRadius: o.style === 'pill' ? 999 : 0,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: o.color,
                        fontSize: 22,
                        fontWeight: '800',
                        textAlign: 'center',
                        textShadowColor:
                          o.style === 'outline' || o.style === 'bold'
                            ? 'rgba(0,0,0,0.9)'
                            : 'transparent',
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: o.style === 'outline' || o.style === 'bold' ? 4 : 0,
                        borderWidth: activeOverlayId === o.id ? 1 : 0,
                        borderColor: '#34D399',
                        paddingHorizontal: 4,
                      }}
                    >
                      {o.text}
                    </Text>
                  </View>
                ) : null
              )}
            {activeTab === 'crop' && selectedCrop !== 'free' && (
              <CropFrameOverlay
                aspect={selectedCrop}
                containerW={SCREEN_W}
                containerH={PREVIEW_H}
              />
            )}
            {isProcessing && (
              <View style={tw`absolute inset-0 bg-black/50 items-center justify-center`}>
                <ActivityIndicator color="#10B981" size="large" />
              </View>
            )}
          </View>
        </View>

        {activeTab === 'crop' && selectedCrop !== 'free' && (
          <Text style={tw`text-center text-stone-500 text-[11px] py-1.5 bg-black`}>
            Drag to reframe · Apply Crop when ready
          </Text>
        )}
        {activeTab === 'overlay' && activeOverlay && (
          <Text style={tw`text-center text-stone-500 text-[11px] py-1.5 bg-black`}>
            Drag text to reposition
          </Text>
        )}

        <View style={tw`flex-row border-b border-stone-800 bg-stone-900`}>
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={tw`flex-1 items-center py-2.5 border-b-2 ${
                  active ? 'border-brand-500' : 'border-transparent'
                }`}
              >
                <Ionicons name={tab.icon} size={18} color={active ? '#34D399' : '#78716C'} />
                <Text
                  style={tw`text-[9px] mt-0.5 ${
                    active ? 'text-brand-400 font-semibold' : 'text-stone-500'
                  }`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={tw`flex-1 bg-stone-900`}>
          {activeTab === 'looks' && (
            <View style={tw`flex-1 pt-3`}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={tw`px-4 pb-2`}
              >
                {FILTER_CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat.id}
                    onPress={() => setActiveCategory(cat.id)}
                    style={tw`px-3 py-1.5 rounded-full mr-2 ${
                      activeCategory === cat.id ? 'bg-brand-600' : 'bg-stone-800'
                    }`}
                  >
                    <Text
                      style={tw`text-xs font-semibold ${
                        activeCategory === cat.id ? 'text-white' : 'text-stone-400'
                      }`}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={tw`px-4 py-2`}
              >
                {visiblePresets.map((preset) => {
                  const thumbFilter = buildCssFilter(
                    mergeAdjustments(preset.id, { ...DEFAULT_ADJUSTMENTS })
                  );
                  return (
                    <FilterThumb
                      key={preset.id}
                      uri={workingUri}
                      label={preset.label}
                      active={presetId === preset.id}
                      filterCss={thumbFilter}
                      onPress={() => {
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
                  }}
                />
              ))}
              <Pressable onPress={resetLooksAndAdjust} style={tw`self-center py-2 px-6 mb-4`}>
                <Text style={tw`text-brand-400 font-semibold text-sm`}>Reset looks & adjust</Text>
              </Pressable>
            </ScrollView>
          )}

          {activeTab === 'overlay' && enableOverlays && (
            <ScrollView style={tw`flex-1 px-4 pt-3`} showsVerticalScrollIndicator={false}>
              <Pressable
                onPress={addTextOverlay}
                style={tw`flex-row items-center justify-center gap-2 bg-brand-600 py-3 rounded-xl mb-4`}
              >
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={tw`text-white font-semibold`}>Add text</Text>
              </Pressable>

              {overlays.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={tw`mb-3`}
                >
                  {overlays.map((o, idx) => (
                    <Pressable
                      key={o.id}
                      onPress={() => setActiveOverlayId(o.id)}
                      style={tw`px-3 py-2 rounded-lg mr-2 ${
                        activeOverlayId === o.id ? 'bg-brand-600' : 'bg-stone-800'
                      }`}
                    >
                      <Text style={tw`text-white text-xs font-semibold`}>
                        {o.text.trim() || `Text ${idx + 1}`}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              {activeOverlay ? (
                <>
                  <Text style={tw`text-stone-400 text-xs mb-1`}>Label</Text>
                  <TextInput
                    value={activeOverlay.text}
                    onChangeText={(t) => updateActiveOverlay({ text: t.slice(0, 48) })}
                    placeholder="Your text"
                    placeholderTextColor="#78716C"
                    style={tw`bg-stone-800 text-white rounded-xl px-4 py-3 mb-3`}
                    maxLength={48}
                  />

                  <Text style={tw`text-stone-400 text-xs mb-2`}>Style</Text>
                  <View style={tw`flex-row flex-wrap gap-2 mb-3`}>
                    {TEXT_STYLES.map((s) => (
                      <Pressable
                        key={s.id}
                        onPress={() => updateActiveOverlay({ style: s.id })}
                        style={tw`px-3 py-2 rounded-lg border ${
                          activeOverlay.style === s.id
                            ? 'bg-brand-600 border-brand-500'
                            : 'bg-stone-800 border-stone-700'
                        }`}
                      >
                        <Text style={tw`text-white text-xs font-semibold`}>{s.label}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={tw`text-stone-400 text-xs mb-2`}>Color</Text>
                  <View style={tw`flex-row gap-3 mb-3`}>
                    {TEXT_COLORS.map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => updateActiveOverlay({ color: c })}
                        style={[
                          tw`w-9 h-9 rounded-full border-2`,
                          {
                            backgroundColor: c,
                            borderColor: activeOverlay.color === c ? '#34D399' : '#44403C',
                          },
                        ]}
                      />
                    ))}
                  </View>

                  <Text style={tw`text-stone-300 text-sm font-medium mb-1`}>Size</Text>
                  <Slider
                    style={tw`w-full h-8 mb-3`}
                    minimumValue={0.7}
                    maximumValue={1.8}
                    value={activeOverlay.scale}
                    onValueChange={(v) => updateActiveOverlay({ scale: Math.round(v * 10) / 10 })}
                    minimumTrackTintColor="#059669"
                    maximumTrackTintColor="#44403C"
                    thumbTintColor="#10B981"
                    step={0.1}
                  />

                  <Pressable
                    onPress={removeActiveOverlay}
                    style={tw`self-start flex-row items-center gap-2 py-2 mb-4`}
                  >
                    <Ionicons name="trash-outline" size={18} color="#F87171" />
                    <Text style={tw`text-red-400 font-semibold text-sm`}>Remove text</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={tw`text-stone-500 text-sm mb-4`}>
                  Add a sticker-style label for stories and reels. Drag it on the preview.
                </Text>
              )}

              <View style={tw`border-t border-stone-800 pt-3 mb-4`}>
                <Text style={tw`text-stone-300 text-sm font-medium mb-1`}>Cinematic edges</Text>
                <Text style={tw`text-stone-500 text-xs mb-2`}>
                  Darken frame edges — great for vertical clips.
                </Text>
                <AdjustSlider
                  label="Amount"
                  value={manualAdjust.cinematic}
                  min={0}
                  max={50}
                  onChange={(v) => setAdjust('cinematic', v)}
                />
              </View>
            </ScrollView>
          )}

          {activeTab === 'crop' && (
            <View style={tw`flex-1 px-4 pt-4`}>
              <Text style={tw`text-stone-400 text-sm mb-3`}>
                Choose a ratio, drag the photo to reframe, then apply.
              </Text>
              <View style={tw`flex-row flex-wrap gap-2 mb-4`}>
                {CROP_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.id}
                    onPress={() => {
                      pushHistory();
                      setSelectedCrop(opt.id);
                      if (opt.id === 'free') {
                        setCropOffsetX(0);
                        setCropOffsetY(0);
                      }
                    }}
                    disabled={isProcessing}
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
                <Text style={tw`text-stone-500 text-xs`}>−15°</Text>
                <Text style={tw`text-stone-400 text-sm`}>{straighten.toFixed(0)}°</Text>
                <Text style={tw`text-stone-500 text-xs`}>+15°</Text>
              </View>
              <Slider
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
                  style={tw`self-start flex-row items-center gap-2 bg-stone-800 px-4 py-2.5 rounded-xl mb-6`}
                >
                  <Ionicons name="checkmark" size={18} color="#34D399" />
                  <Text style={tw`text-brand-400 font-semibold text-sm`}>Apply straighten</Text>
                </Pressable>
              )}
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
