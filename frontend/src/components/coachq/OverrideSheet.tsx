import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Modal, ActivityIndicator } from 'react-native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import KeyboardInsetView from '../ui/KeyboardInsetView';
import type { QueueClient, QueueStatus } from '../../services/api/coachq';

type Props = {
  item: QueueClient | null;
  onClose: () => void;
  /** status null clears an existing override. */
  onSave: (status: QueueStatus | null, reason: string) => Promise<void>;
};

const OPTIONS: Array<{ key: QueueStatus; label: string; on: string }> = [
  { key: 'red', label: 'Act today', on: 'bg-rose-600 border-rose-600' },
  { key: 'amber', label: 'This week', on: 'bg-amber-500 border-amber-500' },
  { key: 'green', label: 'On track', on: 'bg-emerald-600 border-emerald-600' },
];

/** Coach sets a client's queue status by hand for 7 days, with a short reason. */
export default function OverrideSheet({ item, onClose, onSave }: Props) {
  const [status, setStatus] = useState<QueueStatus>('green');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return;
    setStatus(item.override?.status ?? (item.status === 'green' ? 'amber' : 'green'));
    setReason(item.override?.reason ?? '');
  }, [item]);

  const save = async (s: QueueStatus | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave(s, reason.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardInsetView style={tw`flex-1 justify-end bg-black/40`} contentStyle={tw`justify-end`}>
        <PressableScale onPress={onClose} feedback="close" style={tw`flex-1`} accessibilityLabel="Dismiss" />
        <View style={tw`bg-page rounded-t-sheet px-gutter-wide pt-3 pb-8`}>
          <View style={tw`w-10 h-1 rounded-full bg-line self-center mb-4`} />
          <Text style={tw`text-title font-bold text-ink`}>Change status</Text>
          <Text style={tw`text-footnote text-ink-3 mt-1 mb-3 leading-5`}>
            Your choice holds for 7 days, then the queue goes back to automatic.
          </Text>
          <View style={tw`flex-row mb-3`} accessibilityRole="radiogroup">
            {OPTIONS.map((o) => {
              const on = status === o.key;
              return (
                <PressableScale
                  key={o.key}
                  onPress={() => setStatus(o.key)}
                  feedback="chip"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  style={tw`mr-2 px-3 py-1.5 rounded-chip border ${on ? o.on : 'bg-raised border-line'}`}
                >
                  <Text style={tw`text-footnote font-semibold ${on ? 'text-white' : 'text-ink-2'}`}>{o.label}</Text>
                </PressableScale>
              );
            })}
          </View>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Why? (e.g. talked on the phone, on holiday)"
            placeholderTextColor={theme.colors.placeholder}
            maxLength={200}
            accessibilityLabel="Reason"
            style={tw`bg-card border border-line/80 rounded-card px-3.5 py-3 text-body text-ink mb-3`}
          />
          <PressableScale
            onPress={() => void save(status)}
            disabled={busy || !reason.trim()}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !reason.trim() }}
            style={tw`py-3.5 rounded-card bg-emerald-600 items-center ${busy || !reason.trim() ? 'opacity-50' : ''}`}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={tw`text-white font-bold`}>Save for 7 days</Text>}
          </PressableScale>
          {item?.override ? (
            <PressableScale onPress={() => void save(null)} disabled={busy} style={tw`py-3 items-center mt-1`}>
              <Text style={tw`text-ink-2 font-semibold`}>Back to automatic</Text>
            </PressableScale>
          ) : (
            <PressableScale onPress={onClose} style={tw`py-3 items-center mt-1`}>
              <Text style={tw`text-ink-3 font-semibold`}>Cancel</Text>
            </PressableScale>
          )}
        </View>
      </KeyboardInsetView>
    </Modal>
  );
}
