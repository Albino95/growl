import React, { useState } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

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
      <SafeAreaView style={tw`flex-1 bg-surface-page`}>
        <View style={tw`px-5 pt-4 pb-3 flex-row items-start justify-between`}>
          <View style={tw`flex-1 pr-3`}>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
              Grow!
            </Text>
            <Text style={tw`text-2xl font-bold text-stone-900 mt-1`}>Post lifespan</Text>
            <Text style={tw`text-sm text-stone-500 mt-1.5 leading-5`}>
              After this many days, your posts soft-hide from timelines so focus stays on current growth.
              Nothing is permanently deleted yet.
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={tw`w-10 h-10 rounded-full bg-white border border-stone-200 items-center justify-center`}
          >
            <Ionicons name="close" size={20} color="#57534E" />
          </TouchableOpacity>
        </View>

        <ScrollView style={tw`flex-1 px-5`} contentContainerStyle={tw`pb-8`}>
          <View style={tw`bg-[#EAE4D6] border border-stone-200/80 rounded-2xl p-4 mb-4`}>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
              Days until fade
            </Text>
            <TextInput
              value={String(days)}
              onChangeText={(text) => {
                const num = parseInt(text.replace(/\D/g, ''), 10);
                if (!text) setDays(1);
                else if (!Number.isNaN(num) && num >= 1 && num <= 365) setDays(num);
              }}
              keyboardType="number-pad"
              style={tw`bg-white border border-stone-200 rounded-xl px-4 py-3 text-3xl font-bold text-stone-900`}
            />
            <View style={tw`flex-row flex-wrap mt-3`}>
              {PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  onPress={() => setDays(preset)}
                  style={tw`mr-2 mb-2 px-3.5 py-2 rounded-full border ${
                    days === preset
                      ? 'bg-emerald-600 border-emerald-600'
                      : 'bg-white border-stone-200'
                  }`}
                >
                  <Text
                    style={tw`text-sm font-semibold ${
                      days === preset ? 'text-white' : 'text-stone-700'
                    }`}
                  >
                    {preset}d
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={tw`bg-white border border-stone-200/80 rounded-2xl p-4 mb-5`}>
            <View style={tw`flex-row items-start`}>
              <View style={tw`w-9 h-9 rounded-xl bg-emerald-600/12 items-center justify-center mr-3`}>
                <Ionicons name="eye-off-outline" size={18} color="#059669" />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-sm font-bold text-stone-900`}>Soft-hide, not delete</Text>
                <Text style={tw`text-xs text-stone-500 mt-1 leading-4`}>
                  Faded posts leave feeds and your public Posts tab. You can still open them from
                  detail links while we build an archive.
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => void handleSave()}
            disabled={saving}
            style={tw`bg-emerald-600 rounded-2xl py-4 items-center ${saving ? 'opacity-60' : ''}`}
          >
            <Text style={tw`text-white font-bold text-base`}>
              {saving ? 'Saving…' : 'Save lifespan'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
