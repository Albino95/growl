import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import KeyboardInsetView from '../ui/KeyboardInsetView';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import type { CoachingAssignment } from '../../services/api/instructor';
import { sendHomeworkFeedback } from '../../services/api/coaching';
import { feedback } from '../../utils/interactionFeedback';
import { alertMessage } from '../../utils/confirmDialog';

const QUICK = ['Great work — keep it up.', 'Good effort. Next time, slow it down.', 'Let’s talk about this one.'];

/** Coach writes (or edits) feedback on a client's homework. The client is notified. */
export default function HomeworkFeedbackSheet({
  assignment,
  onClose,
  onSaved,
}: {
  assignment: CoachingAssignment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (assignment) setText(assignment.coach_feedback || '');
  }, [assignment?.id, assignment?.coach_feedback]);

  const save = async () => {
    if (!assignment || busy || !text.trim()) return;
    setBusy(true);
    try {
      await sendHomeworkFeedback(assignment.id, text.trim());
      feedback.send();
      onClose();
      onSaved();
    } catch (e) {
      feedback.error();
      void alertMessage('Feedback', e instanceof Error ? e.message : 'Could not send');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={!!assignment}
      transparent
      animationType="slide"
      onRequestClose={() => !busy && onClose()}
    >
      <KeyboardInsetView style={tw`flex-1 justify-end bg-black/40`} contentStyle={tw`justify-end`}>
        <View style={tw`bg-page rounded-t-sheet px-gutter-wide pt-4 pb-8`}>
          <View style={tw`flex-row items-center justify-between mb-1`}>
            <Text style={tw`text-lg font-bold text-ink flex-1`} numberOfLines={1}>
              Feedback · {assignment?.title}
            </Text>
            <PressableScale
              onPress={() => !busy && onClose()}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              style={tw`w-9 h-9 rounded-full bg-raised items-center justify-center`}
            >
              <Ionicons name="close" size={18} color={theme.colors.ink} />
            </PressableScale>
          </View>
          <Text style={tw`text-sm text-ink-3 mb-3 leading-5`}>
            Your client gets a notification and sees this under the homework.
          </Text>
          <View style={tw`flex-row flex-wrap mb-2`}>
            {QUICK.map((q) => (
              <PressableScale
                key={q}
                onPress={() => setText(q)}
                feedback="chip"
                accessibilityRole="button"
                accessibilityLabel={`Use: ${q}`}
                style={tw`mr-2 mb-2 px-3 py-1.5 rounded-chip bg-raised border border-line`}
              >
                <Text style={tw`text-footnote text-ink-2`}>{q}</Text>
              </PressableScale>
            ))}
          </View>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="What went well, what to try next"
            placeholderTextColor={theme.colors.placeholder}
            multiline
            maxLength={600}
            editable={!busy}
            accessibilityLabel="Feedback for your client"
            style={tw`bg-card border border-line/80 rounded-card px-3.5 py-3 text-body text-ink min-h-[88px] max-h-40 mb-4`}
            textAlignVertical="top"
          />
          <PressableScale
            onPress={() => void save()}
            disabled={busy || !text.trim()}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !text.trim() }}
            style={tw`py-3.5 rounded-card bg-emerald-600 items-center ${
              busy || !text.trim() ? 'opacity-60' : ''
            }`}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={tw`text-white font-bold`}>
                {assignment?.coach_feedback ? 'Update feedback' : 'Send feedback'}
              </Text>
            )}
          </PressableScale>
        </View>
      </KeyboardInsetView>
    </Modal>
  );
}
