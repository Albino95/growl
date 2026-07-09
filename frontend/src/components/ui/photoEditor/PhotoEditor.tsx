import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import tw from '../../../lib/tw';
import { alertMessage } from '../../../utils/confirmDialog';
import type { CropAspect, EditAdjustments, EditorTab, PhotoEditorProps } from './types';
import { DEFAULT_ADJUSTMENTS } from './types';
import { FILTER_CATEGORIES, getPresetsForCategory } from './presets';
import { buildCssFilter, hasActiveEdits, mergeAdjustments, snapSliderValue } from './filterEngine';
import {
  cropToAspect,
  exportEditedImage,
  flipImage,
  rotateImage,
} from './imageProcessing';
import type { FilterCategory } from './types';

const { width: SCREEN_W } = Dimensions.get('window');
const PREVIEW_H = Math.min(SCREEN_W * 1.05, 480);

const TABS: { id: EditorTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'presets', label: 'Presets', icon: 'color-filter-outline' },
  { id: 'adjust', label: 'Adjust', icon: 'options-outline' },
  { id: 'crop', label: 'Crop', icon: 'crop-outline' },
  { id: 'transform', label: 'Transform', icon: 'sync-outline' },
];

const CROP_OPTIONS: { id: CropAspect; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: '1:1', label: '1:1' },
  { id: '4:5', label: '4:5' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
];

type AdjustKey = keyof EditAdjustments;

const ADJUST_SLIDERS: {
  key: AdjustKey;
  label: string;
  min: number;
  max: number;
  defaultValue: number;
}[] = [
  { key: 'exposure', label: 'Exposure', min: -40, max: 40, defaultValue: 0 },
  { key: 'brightness', label: 'Brightness', min: -40, max: 40, defaultValue: 0 },
  { key: 'contrast', label: 'Contrast', min: -40, max: 60, defaultValue: 0 },
  { key: 'saturation', label: 'Saturation', min: -80, max: 80, defaultValue: 0 },
  { key: 'warmth', label: 'Warmth', min: -40, max: 40, defaultValue: 0 },
  { key: 'tint', label: 'Tint', min: -40, max: 40, defaultValue: 0 },
  { key: 'fade', label: 'Fade', min: 0, max: 50, defaultValue: 0 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 50, defaultValue: 0 },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 50, defaultValue: 0 },
  { key: 'grain', label: 'Grain', min: 0, max: 50, defaultValue: 0 },
];

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
          style={[tw`w-full h-full`, filterCss !== 'none' ? { filter: filterCss } as object : null]}
          contentFit="cover"
        />
      </View>
      <Text
        style={tw`text-[10px] mt-1.5 text-center ${active ? 'text-brand-400 font-semibold' : 'text-stone-400'}`}
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
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
        onValueChange={handleChange}
        onSlidingComplete={handleChange}
        minimumTrackTintColor="#059669"
        maximumTrackTintColor="#44403C"
        thumbTintColor="#10B981"
        step={1}
      />
    </View>
  );
}

export default function PhotoEditor({ imageUri, onSave, onCancel }: PhotoEditorProps) {
  const insets = useSafeAreaInsets();
  const [workingUri, setWorkingUri] = useState(imageUri);
  const [presetId, setPresetId] = useState<string | null>('original');
  const [manualAdjust, setManualAdjust] = useState<EditAdjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [activeTab, setActiveTab] = useState<EditorTab>('presets');
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('natural');
  const [selectedCrop, setSelectedCrop] = useState<CropAspect>('free');
  const [isProcessing, setIsProcessing] = useState(false);

  const effective = useMemo(
    () => mergeAdjustments(presetId, manualAdjust),
    [presetId, manualAdjust]
  );
  const filterCss = useMemo(() => buildCssFilter(effective), [effective]);
  const isEdited = hasActiveEdits(manualAdjust, presetId);

  const visiblePresets = useMemo(
    () => getPresetsForCategory(activeCategory),
    [activeCategory]
  );

  const setAdjust = useCallback((key: AdjustKey, value: number) => {
    const snapped = snapSliderValue(value);
    setManualAdjust((prev) => {
      if (prev[key] === snapped) return prev;
      return { ...prev, [key]: snapped };
    });
  }, []);

  const resetAll = useCallback(() => {
    setPresetId('original');
    setManualAdjust({ ...DEFAULT_ADJUSTMENTS });
  }, []);

  const handleSave = useCallback(async () => {
    setIsProcessing(true);
    try {
      const exported = await exportEditedImage(workingUri, effective);
      onSave(exported);
    } catch {
      alertMessage('Export failed', 'Could not apply edits. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [workingUri, effective, onSave]);

  const handleRotate = useCallback(async () => {
    setIsProcessing(true);
    try {
      const next = await rotateImage(workingUri);
      setWorkingUri(next);
    } catch {
      alertMessage('Error', 'Could not rotate image.');
    } finally {
      setIsProcessing(false);
    }
  }, [workingUri]);

  const handleFlip = useCallback(
    async (dir: 'horizontal' | 'vertical') => {
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
    [workingUri]
  );

  const applyCropAspect = useCallback(
    async (aspect: CropAspect) => {
      setSelectedCrop(aspect);
      if (aspect === 'free') return;

      setIsProcessing(true);
      try {
        const next = await cropToAspect(workingUri, aspect);
        setWorkingUri(next);
      } catch {
        alertMessage('Error', 'Could not crop image.');
      } finally {
        setIsProcessing(false);
      }
    },
    [workingUri]
  );

  const previewStyle = filterCss !== 'none' ? ({ filter: filterCss } as object) : undefined;
  const vignetteOpacity = Math.min(0.65, effective.vignette / 70);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={tw`flex-1 bg-stone-950`} edges={['top', 'bottom']}>
        {/* Header */}
        <View
          style={[
            tw`flex-row items-center justify-between px-4 border-b border-stone-800`,
            { paddingTop: Math.max(insets.top, 4), paddingBottom: 10 },
          ]}
        >
          <Pressable onPress={onCancel} disabled={isProcessing} hitSlop={12}>
            <Text style={tw`text-stone-300 text-base`}>Cancel</Text>
          </Pressable>
          <View style={tw`items-center`}>
            <Text style={tw`text-white text-base font-bold`}>Edit Photo</Text>
            {isEdited && <Text style={tw`text-brand-400 text-[10px] mt-0.5`}>Edited</Text>}
          </View>
          <Pressable onPress={handleSave} disabled={isProcessing} hitSlop={12}>
            <Text style={tw`${isProcessing ? 'text-stone-600' : 'text-brand-400'} text-base font-bold`}>
              {isProcessing ? 'Saving…' : 'Done'}
            </Text>
          </Pressable>
        </View>

        {/* Preview */}
        <View style={[tw`items-center justify-center bg-black`, { height: PREVIEW_H }]}>
          <View style={tw`relative w-full h-full`}>
            <Image
              source={{ uri: workingUri }}
              style={[tw`w-full h-full`, previewStyle]}
              contentFit="contain"
              transition={150}
            />
            {vignetteOpacity > 0 && (
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFillObject, { backgroundColor: `rgba(0,0,0,${vignetteOpacity})` }]}
              />
            )}
            {isProcessing && (
              <View style={tw`absolute inset-0 bg-black/50 items-center justify-center`}>
                <ActivityIndicator color="#10B981" size="large" />
              </View>
            )}
          </View>
        </View>

        {/* Tab bar */}
        <View style={tw`flex-row border-b border-stone-800 bg-stone-900`}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={tw`flex-1 items-center py-3 border-b-2 ${
                  active ? 'border-brand-500' : 'border-transparent'
                }`}
              >
                <Ionicons name={tab.icon} size={20} color={active ? '#34D399' : '#78716C'} />
                <Text style={tw`text-[10px] mt-1 ${active ? 'text-brand-400 font-semibold' : 'text-stone-500'}`}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Panel */}
        <View style={tw`flex-1 bg-stone-900`}>
          {activeTab === 'presets' && (
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
                      onPress={() => setPresetId(preset.id)}
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
                  onChange={(v) => setAdjust(s.key, v)}
                />
              ))}
              <Pressable onPress={resetAll} style={tw`self-center py-2 px-6 mb-4`}>
                <Text style={tw`text-brand-400 font-semibold text-sm`}>Reset all</Text>
              </Pressable>
            </ScrollView>
          )}

          {activeTab === 'crop' && (
            <View style={tw`flex-1 px-4 pt-4`}>
              <Text style={tw`text-stone-400 text-sm mb-4`}>
                Tap an aspect ratio to crop instantly. Choose Free to keep the full image.
              </Text>
              <View style={tw`flex-row flex-wrap gap-2`}>
                {CROP_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.id}
                    onPress={() => applyCropAspect(opt.id)}
                    disabled={isProcessing}
                    style={tw`px-4 py-2.5 rounded-xl border ${
                      selectedCrop === opt.id
                        ? 'bg-brand-600 border-brand-500'
                        : 'bg-stone-800 border-stone-700'
                    } ${isProcessing ? 'opacity-60' : ''}`}
                  >
                    <Text
                      style={tw`font-semibold ${
                        selectedCrop === opt.id ? 'text-white' : 'text-stone-300'
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {isProcessing && (
                <View style={tw`flex-row items-center justify-center mt-6 gap-2`}>
                  <ActivityIndicator color="#10B981" size="small" />
                  <Text style={tw`text-stone-400 text-sm`}>Cropping…</Text>
                </View>
              )}
            </View>
          )}

          {activeTab === 'transform' && (
            <View style={tw`flex-1 px-4 pt-4`}>
              <View style={tw`flex-row justify-around`}>
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
                    onPress={action.onPress}
                    disabled={isProcessing}
                    style={tw`items-center`}
                  >
                    <View style={tw`w-14 h-14 rounded-2xl bg-stone-800 items-center justify-center mb-2`}>
                      <Ionicons name={action.icon} size={26} color="#FFFFFF" />
                    </View>
                    <Text style={tw`text-stone-400 text-xs`}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
