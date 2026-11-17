import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import KeyboardInsetView from '../ui/KeyboardInsetView';
import { getReplyTemplates, saveReplyTemplates } from '../../services/api/coachq';
import { alertMessage } from '../../utils/confirmDialog';
import { feedback } from '../../utils/interactionFeedback';

export const TEMPLATES_MAX = 20;

type Props = {
  visible: boolean;
  /** Who the reply goes to (shown in the title). */
  recipient?: string | null;
  onClose: () => void;
  /** Called with the chosen (possibly edited) reply text. */
  onPick: (text: string) => void | Promise<void>;
  /** Pre-loaded templates (skips the fetch). */
  initial?: string[] | null;
  onTemplatesChange?: (t: string[]) => void;
};

/** Quick replies: tap to send, or edit the saved list (max 20, stored on the server). */
export default function ReplyTemplatesSheet({ visible, recipient, onClose, onPick, initial, onTemplatesChange }: Props) {
  const [templates, setTemplates] = useState<string[] | null>(initial ?? null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setEditing(false);
    setCustom('');
    if (initial) {
      setTemplates(initial);
      return;
    }
    let alive = true;
    getReplyTemplates()
      .then((t) => alive && setTemplates(t))
      .catch(() => alive && setTemplates([]));
    return () => {
      alive = false;
    };
  }, [visible, initial]);

  const persist = async (next: string[]) => {
    setBusy(true);
    try {
      const saved = await saveReplyTemplates(next);
      setTemplates(saved);
      onTemplatesChange?.(saved);
      feedback.success();
    } catch (e) {
      void alertMessage('Quick replies', e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onPick(t);
    } finally {
      setBusy(false);
    }
  };

  const list = templates || [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardInsetView style={tw`flex-1 justify-end bg-black/40`} contentStyle={tw`justify-end`}>
        <PressableScale onPress={onClose} feedback="close" style={tw`flex-1`} accessibilityLabel="Dismiss" />
        <View style={tw`bg-page rounded-t-sheet px-gutter-wide pt-3 pb-8 max-h-[85%]`}>
          <View style={tw`w-10 h-1 rounded-full bg-line self-center mb-4`} />
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <Text style={tw`text-title font-bold text-ink flex-1`} numberOfLines={1}>
              {editing ? 'Edit quick replies' : recipient ? `Reply to ${recipient}` : 'Quick reply'}
            </Text>
            <PressableScale
              onPress={() => setEditing((v) => !v)}
              feedback="chip"
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Done editing' : 'Edit quick replies'}
              style={tw`px-3 py-1.5 rounded-chip bg-raised border border-line`}
            >
              <Text style={tw`text-footnote font-semibold text-ink-2`}>{editing ? 'Done' : 'Edit'}</Text>
            </PressableScale>
          </View>

          {templates === null ? (
            <ActivityIndicator color={theme.colors.brand} style={tw`my-6`} />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {list.length === 0 && !editing ? (
                <Text style={tw`text-body text-ink-3 mb-3`}>No quick replies yet. Tap Edit to add your own.</Text>
              ) : null}
              {list.map((t, i) => (
                <View key={`${i}:${t}`} style={tw`flex-row items-center mb-2`}>
                  <PressableScale
                    onPress={() => (editing ? undefined : void send(t))}
                    disabled={busy || editing}
                    feedback="send"
                    accessibilityRole="button"
                    accessibilityLabel={editing ? t : `Send: ${t}`}
                    style={tw`flex-1 px-3.5 py-3 rounded-card bg-card border border-line/80`}
                  >
                    <Text style={tw`text-body text-ink`}>{t}</Text>
                  </PressableScale>
                  {editing ? (
                    <PressableScale
                      onPress={() => void persist(list.filter((_, j) => j !== i))}
                      disabled={busy}
                      feedback="delete"
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${t}`}
                      style={tw`ml-2 w-9 h-9 rounded-full bg-raised items-center justify-center`}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                    </PressableScale>
                  ) : null}
                </View>
              ))}

              {editing ? (
                list.length < TEMPLATES_MAX ? (
                  <View style={tw`flex-row items-center mt-1`}>
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      placeholder="New quick reply"
                      placeholderTextColor={theme.colors.placeholder}
                      maxLength={200}
                      accessibilityLabel="New quick reply"
                      style={tw`flex-1 bg-card border border-line/80 rounded-card px-3.5 py-3 text-body text-ink`}
                    />
                    <PressableScale
                      onPress={() => {
                        const t = draft.trim();
                        if (!t) return;
                        setDraft('');
                        void persist([...list, t]);
                      }}
                      disabled={busy || !draft.trim()}
                      accessibilityRole="button"
                      accessibilityLabel="Add quick reply"
                      style={tw`ml-2 px-3.5 py-3 rounded-card bg-emerald-600 ${!draft.trim() ? 'opacity-50' : ''}`}
                    >
                      <Text style={tw`text-white font-bold`}>Add</Text>
                    </PressableScale>
                  </View>
                ) : (
                  <Text style={tw`text-footnote text-ink-3 mt-1`}>You have the maximum of {TEMPLATES_MAX}.</Text>
                )
              ) : (
                <View style={tw`flex-row items-center mt-2`}>
                  <TextInput
                    value={custom}
                    onChangeText={setCustom}
                    placeholder="Or write something"
                    placeholderTextColor={theme.colors.placeholder}
                    maxLength={600}
                    multiline
                    accessibilityLabel="Write a reply"
                    style={tw`flex-1 bg-card border border-line/80 rounded-card px-3.5 py-3 text-body text-ink max-h-28`}
                  />
                  <PressableScale
                    onPress={() => void send(custom)}
                    disabled={busy || !custom.trim()}
                    feedback={false}
                    accessibilityRole="button"
                    accessibilityLabel="Send reply"
                    style={tw`ml-2 w-11 h-11 rounded-full bg-emerald-600 items-center justify-center ${
                      !custom.trim() ? 'opacity-50' : ''
                    }`}
                  >
                    {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
                  </PressableScale>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardInsetView>
    </Modal>
  );
}
