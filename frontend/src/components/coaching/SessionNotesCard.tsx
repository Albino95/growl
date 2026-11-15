import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import {
  addSessionNote,
  deleteSessionNote,
  listSessionNotes,
  type SessionNote,
} from '../../services/api/coaching';
import { feedback } from '../../utils/interactionFeedback';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { formatHomeworkDate } from './homeworkDates';

const NOTE_MAX = 1000;

/** Coach-only private notes on a coaching plan. The client never sees these. */
export default function SessionNotesCard({
  contractId,
  reloadKey,
}: {
  contractId: string;
  reloadKey?: number;
}) {
  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setNotes(await listSessionNotes(contractId));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const save = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const note = await addSessionNote(contractId, text);
      setNotes((prev) => [note, ...prev]);
      setDraft('');
      feedback.success();
    } catch (e) {
      feedback.error();
      void alertMessage('Note', e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (note: SessionNote) => {
    const ok = await confirmAsync('Delete this note?', 'This can’t be undone.', {
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const prev = notes;
    setNotes((n) => n.filter((x) => x.id !== note.id));
    try {
      await deleteSessionNote(note.id);
    } catch (e) {
      setNotes(prev);
      void alertMessage('Note', e instanceof Error ? e.message : 'Could not delete');
    }
  };

  const visible = showAll ? notes : notes.slice(0, 3);

  return (
    <View style={tw`mt-3 px-4 py-3.5 rounded-card bg-card border border-line/80`}>
      <View style={tw`flex-row items-center`}>
        <Ionicons name="lock-closed-outline" size={13} color={theme.colors.iconMuted} />
        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase ml-1.5`}>
          Session notes · only you
        </Text>
      </View>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="What you worked on, what to try next…"
        placeholderTextColor={theme.colors.placeholder}
        multiline
        maxLength={NOTE_MAX}
        editable={!busy}
        accessibilityLabel="New private session note"
        style={tw`mt-2 bg-page border border-line/80 rounded-control px-3 py-2.5 text-body text-ink min-h-[60px]`}
      />
      <PressableScale
        onPress={() => void save()}
        disabled={busy || !draft.trim()}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !draft.trim() }}
        style={tw`mt-2 self-end px-4 py-2 rounded-control bg-emerald-600 ${
          busy || !draft.trim() ? 'opacity-50' : ''
        }`}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={tw`text-white text-footnote font-bold`}>Save note</Text>
        )}
      </PressableScale>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={tw`mt-2`} />
      ) : failed ? (
        <PressableScale onPress={() => void load()} accessibilityRole="button" style={tw`mt-2 py-1`}>
          <Text style={tw`text-footnote font-semibold text-emerald-700`}>Couldn’t load notes · Try again</Text>
        </PressableScale>
      ) : notes.length === 0 ? (
        <Text style={tw`text-footnote text-ink-3 mt-2`}>
          No notes yet. Jot down what you covered after each session.
        </Text>
      ) : (
        <>
          {visible.map((n) => (
            <View key={n.id} style={tw`mt-2.5 pt-2.5 border-t border-line/80 flex-row`}>
              <View style={tw`flex-1 pr-2`}>
                <Text style={tw`text-caption text-ink-3`}>{formatHomeworkDate(n.created_at)}</Text>
                <Text style={tw`text-body text-ink-2 mt-0.5 leading-5`}>{n.body}</Text>
              </View>
              <PressableScale
                onPress={() => void remove(n)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Delete note"
                feedback="close"
              >
                <Ionicons name="trash-outline" size={16} color={theme.colors.iconMuted} />
              </PressableScale>
            </View>
          ))}
          {notes.length > 3 ? (
            <PressableScale
              onPress={() => setShowAll((v) => !v)}
              accessibilityRole="button"
              style={tw`mt-2 py-1`}
            >
              <Text style={tw`text-footnote font-semibold text-emerald-700`}>
                {showAll ? 'Show fewer' : `Show all ${notes.length}`}
              </Text>
            </PressableScale>
          ) : null}
        </>
      )}
    </View>
  );
}
