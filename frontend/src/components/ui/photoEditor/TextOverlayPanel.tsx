import React, { useEffect, useRef, useState, createElement } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../lib/tw';
import type { TextAlign, TextOverlay, TextOverlayStyle } from './types';
import { TEXT_COLORS, TEXT_QUICK_PHRASES } from './types';
import { AdjustSlider } from './AdjustSlider';

const TEXT_STYLES: { id: TextOverlayStyle; label: string; hint: string }[] = [
  { id: 'plain', label: 'Clean', hint: 'Simple' },
  { id: 'bold', label: 'Bold', hint: 'Heavy' },
  { id: 'outline', label: 'Outline', hint: 'Stroke' },
  { id: 'pill', label: 'Pill', hint: 'Capsule' },
  { id: 'neon', label: 'Neon', hint: 'Glow' },
  { id: 'shadow', label: 'Shadow', hint: 'Depth' },
  { id: 'banner', label: 'Banner', hint: 'Bar' },
];

const POSITIONS: { id: string; label: string; y: number; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'top', label: 'Top', y: 0.18, icon: 'arrow-up-outline' },
  { id: 'mid', label: 'Center', y: 0.5, icon: 'remove-outline' },
  { id: 'bot', label: 'Bottom', y: 0.82, icon: 'arrow-down-outline' },
];

const ALIGNS: { id: TextAlign; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'left', icon: 'text' },
  { id: 'center', icon: 'text' },
  { id: 'right', icon: 'text' },
];

/** Size uses integer 70–180 (%) so the thumb stays stable. */
function ScaleSlider({
  scale,
  onChange,
}: {
  scale: number;
  onChange: (scale: number) => void;
}) {
  const percent = Math.round(Math.min(1.8, Math.max(0.7, scale)) * 100);
  const [live, setLive] = useState(percent);
  const sliding = useRef(false);

  useEffect(() => {
    if (!sliding.current) setLive(percent);
  }, [percent]);

  const commit = (raw: number) => {
    const next = Math.round(Math.min(180, Math.max(70, raw)));
    setLive(next);
    onChange(next / 100);
  };

  return (
    <View style={tw`mb-4`}>
      <View style={tw`flex-row justify-between mb-1`}>
        <Text style={tw`text-stone-300 text-sm font-medium`}>Size</Text>
        <Text style={tw`text-stone-400 text-sm`}>{live}%</Text>
      </View>
      {Platform.OS === 'web' ? (
        createElement('input', {
          type: 'range',
          min: 70,
          max: 180,
          step: 1,
          value: live,
          onMouseDown: () => {
            sliding.current = true;
          },
          onTouchStart: () => {
            sliding.current = true;
          },
          onChange: (e: { target: { value: string } }) => commit(Number(e.target.value)),
          onMouseUp: () => {
            sliding.current = false;
          },
          onTouchEnd: () => {
            sliding.current = false;
          },
          style: {
            width: '100%',
            height: 32,
            accentColor: '#10B981',
            cursor: 'pointer',
          },
        })
      ) : (
        <Slider
          style={tw`w-full h-8`}
          minimumValue={70}
          maximumValue={180}
          step={1}
          value={live}
          onSlidingStart={() => {
            sliding.current = true;
          }}
          onValueChange={commit}
          onSlidingComplete={(v) => {
            commit(v);
            sliding.current = false;
          }}
          minimumTrackTintColor="#059669"
          maximumTrackTintColor="#44403C"
          thumbTintColor="#10B981"
        />
      )}
    </View>
  );
}

type Props = {
  overlays: TextOverlay[];
  activeOverlay: TextOverlay | null;
  cinematic: number;
  onSelectOverlay: (id: string) => void;
  onAdd: (text?: string) => void;
  onUpdate: (patch: Partial<TextOverlay>) => void;
  onRemove: () => void;
  onCinematicChange: (v: number) => void;
};

export default function TextOverlayPanel({
  overlays,
  activeOverlay,
  cinematic,
  onSelectOverlay,
  onAdd,
  onUpdate,
  onRemove,
  onCinematicChange,
}: Props) {
  return (
    <ScrollView
      style={tw`flex-1 px-4 pt-3`}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={tw`flex-row items-center justify-between mb-3`}>
        <View>
          <Text style={tw`text-white text-base font-bold`}>Text studio</Text>
          <Text style={tw`text-stone-500 text-xs mt-0.5`}>
            Add, style, and place labels on the frame
          </Text>
        </View>
        <Pressable
          onPress={() => onAdd()}
          style={tw`flex-row items-center gap-1.5 bg-brand-600 px-3.5 py-2.5 rounded-full`}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={tw`text-white font-semibold text-sm`}>Add</Text>
        </Pressable>
      </View>

      <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mb-2`}>
        Quick phrases
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={tw`pb-3`}
      >
        {TEXT_QUICK_PHRASES.map((phrase) => (
          <Pressable
            key={phrase}
            onPress={() => {
              if (activeOverlay) onUpdate({ text: phrase });
              else onAdd(phrase);
            }}
            style={tw`px-3 py-2 rounded-full bg-stone-800 border border-stone-700 mr-2`}
          >
            <Text style={tw`text-stone-200 text-xs font-semibold`}>{phrase}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {overlays.length > 0 && (
        <>
          <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mb-2`}>
            Layers
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={tw`mb-3`}
          >
            {overlays.map((o, idx) => (
              <Pressable
                key={o.id}
                onPress={() => onSelectOverlay(o.id)}
                style={[
                  tw`px-3 py-2 rounded-xl mr-2 border`,
                  activeOverlay?.id === o.id
                    ? tw`bg-brand-600/30 border-brand-500`
                    : tw`bg-stone-800 border-stone-700`,
                ]}
              >
                <Text
                  style={tw`text-xs font-semibold ${
                    activeOverlay?.id === o.id ? 'text-brand-300' : 'text-stone-300'
                  }`}
                  numberOfLines={1}
                >
                  {o.text.trim() || `Text ${idx + 1}`}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {activeOverlay ? (
        <>
          <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mb-2`}>
            Content
          </Text>
          <TextInput
            value={activeOverlay.text}
            onChangeText={(t) => onUpdate({ text: t.slice(0, 48) })}
            placeholder="Type your text…"
            placeholderTextColor="#78716C"
            style={tw`bg-stone-800 text-white rounded-2xl px-4 py-3.5 mb-4 border border-stone-700`}
            maxLength={48}
          />

          <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mb-2`}>
            Style
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={tw`pb-3`}
          >
            {TEXT_STYLES.map((s) => {
              const selected = activeOverlay.style === s.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => onUpdate({ style: s.id })}
                  style={[
                    tw`mr-2 px-3.5 py-2.5 rounded-2xl border min-w-[72px]`,
                    selected
                      ? tw`bg-brand-600/25 border-brand-500`
                      : tw`bg-stone-800 border-stone-700`,
                  ]}
                >
                  <Text
                    style={tw`text-xs font-bold ${selected ? 'text-brand-300' : 'text-white'}`}
                  >
                    {s.label}
                  </Text>
                  <Text style={tw`text-[10px] text-stone-500 mt-0.5`}>{s.hint}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mb-2`}>
            Color
          </Text>
          <View style={tw`flex-row flex-wrap gap-2.5 mb-4`}>
            {TEXT_COLORS.map((c) => {
              const selected = activeOverlay.color === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => onUpdate({ color: c })}
                  style={[
                    tw`w-9 h-9 rounded-full border-2 items-center justify-center`,
                    {
                      backgroundColor: c,
                      borderColor: selected ? '#34D399' : c === '#FFFFFF' || c === '#F8FAFC' ? '#57534E' : '#292524',
                    },
                  ]}
                >
                  {selected ? (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={c === '#FFFFFF' || c === '#F8FAFC' || c === '#FBBF24' ? '#111' : '#fff'}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <ScaleSlider
            scale={activeOverlay.scale}
            onChange={(scale) => onUpdate({ scale })}
          />

          <View style={tw`flex-row gap-2 mb-4`}>
            {[
              { label: 'S', scale: 0.8 },
              { label: 'M', scale: 1 },
              { label: 'L', scale: 1.3 },
              { label: 'XL', scale: 1.6 },
            ].map((preset) => {
              const selected = Math.round(activeOverlay.scale * 100) === Math.round(preset.scale * 100);
              return (
                <Pressable
                  key={preset.label}
                  onPress={() => onUpdate({ scale: preset.scale })}
                  style={[
                    tw`flex-1 items-center py-2 rounded-xl border`,
                    selected
                      ? tw`bg-brand-600/25 border-brand-500`
                      : tw`bg-stone-800 border-stone-700`,
                  ]}
                >
                  <Text
                    style={tw`text-xs font-bold ${
                      selected ? 'text-brand-300' : 'text-stone-300'
                    }`}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mb-2`}>
            Placement
          </Text>
          <View style={tw`flex-row gap-2 mb-3`}>
            {POSITIONS.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => onUpdate({ y: p.y, x: 0.5 })}
                style={tw`flex-1 items-center py-2.5 rounded-xl bg-stone-800 border border-stone-700`}
              >
                <Ionicons name={p.icon} size={16} color="#A8A29E" />
                <Text style={tw`text-stone-300 text-[11px] font-semibold mt-1`}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={tw`flex-row gap-2 mb-4`}>
            {ALIGNS.map((a) => {
              const selected = (activeOverlay.align || 'center') === a.id;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => onUpdate({ align: a.id })}
                  style={[
                    tw`flex-1 items-center py-2.5 rounded-xl border`,
                    selected
                      ? tw`bg-brand-600/25 border-brand-500`
                      : tw`bg-stone-800 border-stone-700`,
                  ]}
                >
                  <Text
                    style={tw`text-xs font-bold capitalize ${
                      selected ? 'text-brand-300' : 'text-stone-300'
                    }`}
                  >
                    {a.id}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={onRemove}
            style={tw`self-start flex-row items-center gap-2 py-2 mb-4 px-1`}
          >
            <Ionicons name="trash-outline" size={18} color="#F87171" />
            <Text style={tw`text-red-400 font-semibold text-sm`}>Remove text</Text>
          </Pressable>
        </>
      ) : (
        <View style={tw`bg-stone-800/60 border border-stone-700 rounded-2xl px-4 py-5 mb-4`}>
          <Text style={tw`text-stone-300 text-sm font-medium text-center`}>
            Tap Add or a quick phrase to place text on your story or reel.
          </Text>
          <Text style={tw`text-stone-500 text-xs text-center mt-2`}>
            Drag text on the preview to reposition.
          </Text>
        </View>
      )}

      <View style={tw`border-t border-stone-800 pt-4 mb-6`}>
        <Text style={tw`text-stone-300 text-sm font-medium mb-1`}>Cinematic edges</Text>
        <Text style={tw`text-stone-500 text-xs mb-2`}>
          Soft top/bottom darken — classic vertical look.
        </Text>
        <AdjustSlider label="Amount" value={cinematic} min={0} max={50} onChange={onCinematicChange} />
      </View>
    </ScrollView>
  );
}
