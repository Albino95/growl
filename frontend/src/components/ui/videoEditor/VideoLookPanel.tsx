import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { feedback } from '../../../utils/interactionFeedback';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../lib/tw';
import { AdjustSlider } from '../photoEditor/AdjustSlider';
import FilterCategoryBar from '../photoEditor/FilterCategoryBar';
import type { EditAdjustments, FilterCategory } from '../photoEditor/types';
import { DEFAULT_ADJUSTMENTS } from '../photoEditor/types';
import {
  AUTO_ENHANCE_ADJUSTMENTS,
  buildCssFilter,
  mergeAdjustments,
} from '../photoEditor/filterEngine';
import { getPresetsForCategory } from '../photoEditor/presets';
import type { VideoLookId } from './types';
import { VIDEO_LOOKS } from './types';
import { AdjustmentOverlays, LookLayerOverlays } from './GradeOverlays';

const ADJUST_SLIDERS: {
  key: keyof EditAdjustments;
  label: string;
  min: number;
  max: number;
}[] = [
  { key: 'exposure', label: 'Exposure', min: -40, max: 40 },
  { key: 'brightness', label: 'Brightness', min: -40, max: 40 },
  { key: 'contrast', label: 'Contrast', min: -40, max: 60 },
  { key: 'saturation', label: 'Saturation', min: -80, max: 80 },
  { key: 'warmth', label: 'Warmth', min: -40, max: 40 },
  { key: 'tint', label: 'Tint', min: -40, max: 40 },
  { key: 'highlights', label: 'Highlights', min: -40, max: 40 },
  { key: 'shadows', label: 'Shadows', min: -40, max: 40 },
  { key: 'clarity', label: 'Clarity', min: -40, max: 40 },
  { key: 'fade', label: 'Fade', min: 0, max: 50 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 50 },
  { key: 'grain', label: 'Grain', min: 0, max: 50 },
  { key: 'cinematic', label: 'Letterbox', min: 0, max: 50 },
];

type LookSection = 'presets' | 'adjust' | 'grades';

type Props = {
  lookId: VideoLookId;
  filterPresetId: string | null;
  manualAdjust: EditAdjustments;
  stillUri?: string | null;
  stillSource?: unknown;
  onLookIdChange: (id: VideoLookId) => void;
  onPresetChange: (id: string | null) => void;
  onAdjustChange: (patch: Partial<EditAdjustments>) => void;
  onResetLooks: () => void;
};

export default function VideoLookPanel({
  lookId,
  filterPresetId,
  manualAdjust,
  stillUri,
  stillSource,
  onLookIdChange,
  onPresetChange,
  onAdjustChange,
  onResetLooks,
}: Props) {
  const lookSource =
    stillSource ?? (stillUri ? { uri: stillUri } : null);
  const [section, setSection] = useState<LookSection>('presets');
  const [category, setCategory] = useState<FilterCategory>('natural');
  const presets = getPresetsForCategory(category);

  const sections: { id: LookSection; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'presets', label: 'Presets', icon: 'color-filter-outline' },
    { id: 'adjust', label: 'Adjust', icon: 'options-outline' },
    { id: 'grades', label: 'Grades', icon: 'sparkles-outline' },
  ];

  return (
    <View style={tw`pt-1`}>
      <View style={tw`flex-row items-center justify-between mb-2`}>
        <Text style={tw`text-white text-sm font-bold`}>Color & mood</Text>
        <Pressable
          onPress={onResetLooks}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Reset color and mood"
        >
          <Text style={tw`text-brand-400 text-xs font-semibold`}>Reset</Text>
        </Pressable>
      </View>

      <View style={tw`flex-row mb-3 bg-stone-900 rounded-2xl p-1 border border-stone-800`}>
        {sections.map((s) => {
          const active = section === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSection(s.id)}
              accessibilityRole="tab"
              accessibilityLabel={s.label}
              accessibilityState={{ selected: active }}
              style={[tw`flex-1 flex-row items-center justify-center py-2 rounded-xl`, active && tw`bg-white/12`]}
            >
              <Ionicons name={s.icon} size={14} color={active ? '#34D399' : '#78716C'} />
              <Text
                style={tw`text-[11px] font-bold ml-1 ${active ? 'text-brand-300' : 'text-stone-400'}`}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {section === 'presets' && (
        <>
          <Pressable
            onPress={() => {
              feedback.autoLook();
              onAdjustChange({ ...DEFAULT_ADJUSTMENTS, ...AUTO_ENHANCE_ADJUSTMENTS });
            }}
            accessibilityRole="button"
            accessibilityLabel="Auto enhance"
            style={tw`flex-row items-center self-start mb-3 px-3 py-2 rounded-full bg-brand-600/25 border border-brand-500/50`}
          >
            <Ionicons name="color-wand-outline" size={14} color="#34D399" />
            <Text style={tw`text-brand-300 text-xs font-bold ml-1.5`}>Auto enhance</Text>
          </Pressable>
          <FilterCategoryBar active={category} onSelect={setCategory} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-2`}>
            {presets.map((preset) => {
              const selected = (filterPresetId || 'original') === preset.id;
              const presetAdj = mergeAdjustments(
                preset.id === 'original' ? null : preset.id,
                { ...DEFAULT_ADJUSTMENTS }
              );
              const thumbFilter = buildCssFilter(presetAdj);
              return (
                <Pressable
                  key={preset.id}
                  onPress={() => {
                    feedback.filter();
                    onPresetChange(preset.id === 'original' ? null : preset.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${preset.label} preset`}
                  accessibilityState={{ selected }}
                  style={tw`mr-3 items-center`}
                >
                  <View
                    style={[
                      tw`w-[68px] h-[88px] rounded-2xl overflow-hidden border-2 bg-stone-800`,
                      { borderColor: selected ? '#34D399' : '#44403C' },
                    ]}
                  >
                    {lookSource ? (
                      <Image
                        source={lookSource as { uri: string }}
                        style={[
                          StyleSheet.absoluteFillObject,
                          Platform.OS === 'web' && thumbFilter !== 'none'
                            ? ({ filter: thumbFilter } as object)
                            : null,
                        ]}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#57534E' }]} />
                    )}
                    {Platform.OS !== 'web' ? <AdjustmentOverlays adj={presetAdj} /> : null}
                    {preset.id === 'original' ? (
                      <View style={tw`absolute inset-0 items-center justify-center`}>
                        <Ionicons name="refresh-outline" size={18} color="#E7E5E4" />
                      </View>
                    ) : null}
                    {selected ? (
                      <View style={tw`absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-brand-500 items-center justify-center`}>
                        <Ionicons name="checkmark" size={11} color="#fff" />
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={tw`text-[11px] font-bold mt-1.5 max-w-[68px] text-center ${
                      selected ? 'text-brand-300' : 'text-stone-300'
                    }`}
                    numberOfLines={1}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}

      {section === 'adjust' && (
        <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
          {ADJUST_SLIDERS.map((s) => (
            <AdjustSlider
              key={s.key}
              label={s.label}
              value={manualAdjust[s.key]}
              min={s.min}
              max={s.max}
              onChange={(v) => onAdjustChange({ [s.key]: v })}
            />
          ))}
        </ScrollView>
      )}

      {section === 'grades' && (
        <>
          <Text style={tw`text-stone-400 text-xs mb-3`}>
            Layer cinematic color grades on top of presets & adjustments
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {VIDEO_LOOKS.map((l) => {
              const selected = lookId === l.id;
              return (
                <Pressable
                  key={l.id}
                  onPress={() => onLookIdChange(l.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${l.label} grade`}
                  accessibilityState={{ selected }}
                  style={tw`mr-3 items-center`}
                >
                  <View
                    style={[
                      tw`w-[72px] h-24 rounded-2xl overflow-hidden border-2`,
                      { backgroundColor: l.swatch, borderColor: selected ? '#34D399' : '#44403C' },
                    ]}
                  >
                    {lookSource ? (
                      <Image
                        source={lookSource as { uri: string }}
                        style={StyleSheet.absoluteFillObject}
                        contentFit="cover"
                      />
                    ) : null}
                    <LookLayerOverlays lookId={l.id} />
                    {(l.cinematic || 0) > 0 ? (
                      <>
                        <View style={tw`absolute top-0 left-0 right-0 h-3 bg-black/50`} />
                        <View style={tw`absolute bottom-0 left-0 right-0 h-4 bg-black/55`} />
                      </>
                    ) : null}
                    {l.id === 'none' ? (
                      <View style={tw`absolute inset-0 items-center justify-center`}>
                        <Ionicons name="sparkles-outline" size={22} color="#E7E5E4" />
                      </View>
                    ) : null}
                    {selected ? (
                      <View style={tw`absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-brand-500 items-center justify-center`}>
                        <Ionicons name="checkmark" size={11} color="#fff" />
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={tw`text-[11px] font-bold mt-1.5 ${selected ? 'text-brand-300' : 'text-stone-200'}`}
                  >
                    {l.label}
                  </Text>
                  <Text style={tw`text-[11px] text-stone-400`}>{l.hint}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}
    </View>
  );
}
