import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import type { InstructorOffering } from '../../services/api/instructor';

type Props = {
  visible: boolean;
  offering?: InstructorOffering | null;
  busy?: boolean;
  onClose: () => void;
  onSend: (input: {
    weeks: number;
    sessions_per_week: number;
    weekly_fee_eur: number;
    note?: string;
  }) => void;
};

function num(raw: string, fallback: number) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export default function ProposalComposeSheet({
  visible,
  offering,
  busy,
  onClose,
  onSend,
}: Props) {
  const [weeks, setWeeks] = useState(String(offering?.typical_weeks ?? 2));
  const [sessions, setSessions] = useState(String(offering?.sessions_per_week ?? 3));
  const [weekly, setWeekly] = useState(String(offering?.weekly_fee_eur ?? 10));
  const [note, setNote] = useState('');

  const total = useMemo(() => {
    const w = Math.max(1, Math.floor(num(weeks, 2)));
    const fee = Math.max(1, num(weekly, 10));
    return Math.round(w * fee * 100) / 100;
  }, [weeks, weekly]);

  const trial = offering?.trial_days ?? 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={tw`flex-1 justify-end bg-black/40`}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={tw`bg-[#F3EEE4] rounded-t-3xl px-5 pt-4 pb-8`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <Text style={tw`text-lg font-bold text-stone-900`}>Send a proposal</Text>
            <PressableScale
              onPress={onClose}
              style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] items-center justify-center`}
            >
              <Ionicons name="close" size={18} color="#1C1917" />
            </PressableScale>
          </View>
          <Text style={tw`text-sm text-stone-500 mb-4 leading-5`}>
            Trial is {trial} day{trial === 1 ? '' : 's'} from your offer. No charge in this chat —
            you’ll confirm the plan together first.
          </Text>

          <View style={tw`flex-row gap-2 mb-3`}>
            <Field label="Weeks" value={weeks} onChange={setWeeks} />
            <Field label="Times / week" value={sessions} onChange={setSessions} />
            <Field label="€ / week" value={weekly} onChange={setWeekly} />
          </View>

          <View style={tw`px-3.5 py-3 rounded-2xl bg-[#FFFcf7] border border-stone-200/80 mb-3`}>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
              Total
            </Text>
            <Text style={tw`text-xl font-bold text-stone-900 mt-0.5`}>€{total}</Text>
            <Text style={tw`text-xs text-stone-500 mt-0.5`}>Written total for the plan</Text>
          </View>

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note for the client (optional)"
            placeholderTextColor="#A8A29E"
            multiline
            style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3.5 py-3 text-[15px] text-stone-900 min-h-[72px] mb-4`}
          />

          <PressableScale
            onPress={() =>
              onSend({
                weeks: Math.max(1, Math.floor(num(weeks, 2))),
                sessions_per_week: Math.max(1, Math.floor(num(sessions, 3))),
                weekly_fee_eur: Math.max(1, num(weekly, 10)),
                note: note.trim() || undefined,
              })
            }
            disabled={busy}
            style={tw`py-3.5 rounded-2xl bg-emerald-600 items-center ${busy ? 'opacity-60' : ''}`}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={tw`text-white font-bold`}>Send proposal</Text>
            )}
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={tw`flex-1`}>
      <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-1`}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3 py-2.5 text-[15px] text-stone-900`}
      />
    </View>
  );
}
