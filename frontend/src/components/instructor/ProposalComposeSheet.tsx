import React, { useEffect, useMemo, useState } from 'react';
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
import { formatCurrency, parseLocaleNumber } from '../../utils/money';
import { COACHING_LIMITS } from '../../constants/coaching';

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

type Parsed =
  | { ok: true; weeks: number; sessions: number; weekly: number }
  | { ok: false; error: string };

function parseProposal(weeksRaw: string, sessionsRaw: string, weeklyRaw: string): Parsed {
  const L = COACHING_LIMITS;
  const weeks = parseLocaleNumber(weeksRaw);
  if (weeks == null || !Number.isInteger(weeks) || weeks < L.weeks.min || weeks > L.weeks.max) {
    return { ok: false, error: `Weeks must be a whole number from ${L.weeks.min} to ${L.weeks.max}.` };
  }
  const sessions = parseLocaleNumber(sessionsRaw);
  if (
    sessions == null ||
    !Number.isInteger(sessions) ||
    sessions < L.sessionsPerWeek.min ||
    sessions > L.sessionsPerWeek.max
  ) {
    return {
      ok: false,
      error: `Times / week must be a whole number from ${L.sessionsPerWeek.min} to ${L.sessionsPerWeek.max}.`,
    };
  }
  const weekly = parseLocaleNumber(weeklyRaw);
  if (weekly == null || weekly < L.weeklyFee.min || weekly > L.weeklyFee.max) {
    return {
      ok: false,
      error: `Weekly fee must be between €${L.weeklyFee.min} and €${L.weeklyFee.max}.`,
    };
  }
  return { ok: true, weeks, sessions, weekly: Math.round(weekly * 100) / 100 };
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
  const [showError, setShowError] = useState(false);

  // The sheet stays mounted while closed (and before the offering loads); re-seed on open.
  const seedWeeks = offering?.typical_weeks ?? 2;
  const seedSessions = offering?.sessions_per_week ?? 3;
  const seedWeekly = offering?.weekly_fee_eur ?? 10;
  useEffect(() => {
    if (!visible) return;
    setWeeks(String(seedWeeks));
    setSessions(String(seedSessions));
    setWeekly(String(seedWeekly));
    setShowError(false);
  }, [visible, seedWeeks, seedSessions, seedWeekly]);
  useEffect(() => {
    if (visible) setNote('');
  }, [visible]);

  const parsed = useMemo(() => parseProposal(weeks, sessions, weekly), [weeks, sessions, weekly]);
  const currency = offering?.currency || 'EUR';
  const total = parsed.ok ? Math.round(parsed.weeks * parsed.weekly * 100) / 100 : null;

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
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
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
            <Text style={tw`text-xl font-bold text-stone-900 mt-0.5`}>
              {total != null ? formatCurrency(total, currency) : '—'}
            </Text>
            <Text style={tw`text-xs text-stone-500 mt-0.5`}>Written total for the plan</Text>
          </View>

          {showError && !parsed.ok ? (
            <Text style={tw`text-xs text-red-700 -mt-1 mb-3`}>{parsed.error}</Text>
          ) : null}

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note for the client (optional)"
            placeholderTextColor="#A8A29E"
            multiline
            style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3.5 py-3 text-[15px] text-stone-900 min-h-[72px] mb-4`}
          />

          <PressableScale
            onPress={() => {
              if (!parsed.ok) {
                setShowError(true);
                return;
              }
              onSend({
                weeks: parsed.weeks,
                sessions_per_week: parsed.sessions,
                weekly_fee_eur: parsed.weekly,
                note: note.trim() || undefined,
              });
            }}
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
