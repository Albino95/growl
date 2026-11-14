import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import AnimatedBottomSheet from '../../components/ui/AnimatedBottomSheet';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { haptic } from '../../theme/haptics';
import { toast } from '../../state/useToastStore';
import { setLifeMode, type LifeMode, type LifeModeKind } from '../../services/api/privacy';
import {
  LIFE_MODE_LABEL,
  UNTIL_OPTIONS,
  formatUntil,
  isLifeModeActive,
  untilDateKey,
  untilOptionFor,
} from './lifeMode';

const MODES: { value: LifeModeKind; icon: keyof typeof Ionicons.glyphMap; hint: string }[] = [
  { value: 'sick', icon: 'thermometer-outline', hint: 'Rest up. We’ll keep your place.' },
  { value: 'travel', icon: 'airplane-outline', hint: 'Away from your usual routine.' },
  { value: 'break', icon: 'cafe-outline', hint: 'A pause, for whatever reason.' },
  { value: 'none', icon: 'close-circle-outline', hint: 'Back to normal days.' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Current saved mode (used to preselect). */
  current: LifeMode;
  onSaved: (next: LifeMode) => void;
};

export default function LifeModeSheet({ visible, onClose, current, onSaved }: Props) {
  const [mode, setMode] = useState<LifeModeKind>('none');
  const [untilKey, setUntilKey] = useState<string>('open');
  const [saving, setSaving] = useState(false);

  // Re-seed from the saved mode each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    const active = isLifeModeActive(current);
    setMode(active ? current.mode : 'sick');
    setUntilKey(active ? untilOptionFor(current) : 'open');
  }, [visible, current]);

  const resolveUntil = (): string | null => {
    if (mode === 'none') return null;
    if (untilKey === 'saved') return current.until;
    const opt = UNTIL_OPTIONS.find((o) => o.key === untilKey);
    return opt?.days != null ? untilDateKey(opt.days) : null;
  };

  const save = async (close: () => void) => {
    if (saving) return;
    const next: LifeMode = { mode, until: resolveUntil() };
    setSaving(true);
    try {
      const saved = await setLifeMode(next);
      haptic('success');
      onSaved(saved);
      toast.success(
        saved.mode === 'none' ? 'Welcome back' : `${LIFE_MODE_LABEL[saved.mode]} mode is on`,
      );
      close();
    } catch (e: unknown) {
      haptic('error');
      const msg = e instanceof Error && e.message ? e.message : 'Couldn’t save that — try again';
      toast.info(msg, { icon: 'cloud-offline-outline' });
    } finally {
      setSaving(false);
    }
  };

  const untilChips =
    untilKey === 'saved' && current.until
      ? [{ key: 'saved', label: `Until ${formatUntil(current.until)}` }, ...UNTIL_OPTIONS]
      : UNTIL_OPTIONS;

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose}>
      {({ close }) => (
        <ScrollView contentContainerStyle={tw`px-gutter-wide pt-2 pb-4`} bounces={false}>
          <Text style={tw`text-title font-bold text-ink`}>Taking a break?</Text>
          <Text style={tw`text-body text-ink-2 mt-1 mb-4`}>
            Your streak waits for you. No rest days used.
          </Text>

          <View
            accessibilityRole="radiogroup"
            style={tw`bg-card border border-line/80 rounded-card px-4 mb-4`}
          >
            {MODES.map((m, i) => {
              const selected = mode === m.value;
              return (
                <Pressable
                  key={m.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={LIFE_MODE_LABEL[m.value]}
                  onPress={() => {
                    if (selected) return;
                    haptic('chip');
                    setMode(m.value);
                  }}
                  style={tw`flex-row items-center py-3 ${
                    i < MODES.length - 1 ? 'border-b border-line/80' : ''
                  }`}
                >
                  <View style={tw`w-9 h-9 rounded-full items-center justify-center mr-3 bg-raised`}>
                    <Ionicons name={m.icon} size={18} color={theme.colors.brand} />
                  </View>
                  <View style={tw`flex-1 pr-2`}>
                    <Text style={tw`font-semibold text-ink`}>{LIFE_MODE_LABEL[m.value]}</Text>
                    <Text style={tw`text-xs text-ink-3 mt-0.5`}>{m.hint}</Text>
                  </View>
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={selected ? theme.colors.brand : theme.colors.iconMuted}
                  />
                </Pressable>
              );
            })}
          </View>

          {mode !== 'none' ? (
            <>
              <Text
                style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}
              >
                Until
              </Text>
              <View style={tw`flex-row flex-wrap mb-4`}>
                {untilChips.map((o) => {
                  const selected = untilKey === o.key;
                  return (
                    <Pressable
                      key={o.key}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        if (selected) return;
                        haptic('chip');
                        setUntilKey(o.key);
                      }}
                      hitSlop={4}
                      style={tw`px-3.5 py-2 rounded-chip mr-2 mb-2 border ${
                        selected ? 'bg-brand-600 border-brand-600' : 'bg-raised border-line'
                      }`}
                    >
                      <Text
                        style={tw`text-footnote font-medium ${selected ? 'text-white' : 'text-ink-2'}`}
                      >
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <PrimaryButton
            label={mode === 'none' ? 'Turn off' : 'Save'}
            onPress={() => void save(close)}
            loading={saving}
            disabled={saving}
            feedback={false}
          />
        </ScrollView>
      )}
    </AnimatedBottomSheet>
  );
}
