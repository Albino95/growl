import React, { useState } from 'react';
import { View, Text, Modal, ScrollView, TextInput } from 'react-native';
import PressableScale from '../ui/PressableScale';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import { formInputAccessoryProps } from '../ui/KeyboardDoneAccessory';

const PRESETS = [1, 3, 7, 14, 30, 90];

type Props = {
  visible: boolean;
  initialDays: number;
  onClose: () => void;
  onSave: (days: number) => void | Promise<void>;
};

/** Grow! sheet for choosing how long posts stay visible on timelines. */
export default function DecaySettingsModal({ visible, initialDays, onClose, onSave }: Props) {
  const [days, setDays] = useState(initialDays);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (visible) setDays(initialDays);
  }, [visible, initialDays]);

  const handleSave = async () => {
    if (saving) return;
    const clamped = Math.min(365, Math.max(1, days || 7));
    setSaving(true);
    try {
      await onSave(clamped);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={tw`flex-1 bg-page`}>
        <View style={tw`px-gutter-wide pt-4 pb-3 flex-row items-start justify-between`}>
          <View style={tw`flex-1 pr-3`}>
            <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase`}>
              Grow!
            </Text>
            <Text style={tw`text-2xl font-bold text-ink mt-1`}>Post lifespan</Text>
            <Text style={tw`text-sm text-ink-3 mt-1.5 leading-5`}>
              After this many days, your posts soft-hide from timelines so focus stays on current growth.
              Nothing is permanently deleted yet.
            </Text>
          </View>
          <PressableScale
            onPress={onClose}
            style={tw`w-10 h-10 rounded-full bg-card border border-line items-center justify-center`}
            pressedScale={0.9}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color={theme.colors.ink2} />
          </PressableScale>
        </View>

        <ScrollView style={tw`flex-1 px-gutter-wide`} contentContainerStyle={tw`pb-8`}>
          <View style={tw`bg-raised border border-line/80 rounded-card p-4 mb-4`}>
            <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
              Days until fade
            </Text>
            <TextInput
              {...formInputAccessoryProps()}
              value={String(days)}
              onChangeText={(text) => {
                const num = parseInt(text.replace(/\D/g, ''), 10);
                if (!text) setDays(1);
                else if (!Number.isNaN(num) && num >= 1 && num <= 365) setDays(num);
              }}
              keyboardType="number-pad"
              style={tw`bg-card border border-line rounded-control px-4 py-3 text-3xl font-bold text-ink`}
            />
            <View style={tw`flex-row flex-wrap mt-3`}>
              {PRESETS.map((preset) => (
                <PressableScale
                  key={preset}
                  onPress={() => setDays(preset)}
                  style={tw`mr-2 mb-2 px-3.5 py-2 rounded-chip border ${
                    days === preset
                      ? 'bg-emerald-600 border-emerald-600'
                      : 'bg-card border-line'
                  }`}
                >
                  <Text
                    style={tw`text-sm font-semibold ${
                      days === preset ? 'text-white' : 'text-ink-2'
                    }`}
                  >
                    {preset}d
                  </Text>
                </PressableScale>
              ))}
            </View>
          </View>

          <View style={tw`bg-card border border-line/80 rounded-card p-4 mb-5`}>
            <View style={tw`flex-row items-start`}>
              <View style={tw`w-9 h-9 rounded-control bg-emerald-600/12 items-center justify-center mr-3`}>
                <Ionicons name="eye-off-outline" size={18} color="#059669" />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-sm font-bold text-ink`}>Soft-hide, not delete</Text>
                <Text style={tw`text-xs text-ink-3 mt-1 leading-4`}>
                  After decay, posts leave feeds and your public Posts tab. You can still open them
                  from detail links while we build an archive.
                </Text>
              </View>
            </View>
          </View>

          <PressableScale
            onPress={() => void handleSave()}
            disabled={saving}
            style={tw`bg-emerald-600 rounded-card py-4 items-center ${saving ? 'opacity-60' : ''}`}
          >
            <Text style={tw`text-white font-bold text-base`}>
              {saving ? 'Saving…' : 'Save lifespan'}
            </Text>
          </PressableScale>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
