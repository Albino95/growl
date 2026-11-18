import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import KeyboardInsetView from '../ui/KeyboardInsetView';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { uploadMediaFile } from '../../services/api/media';
import { waterSeed } from '../../services/api/seeds';
import type { CoachingAssignment } from '../../services/api/instructor';
import { FAST_IMAGE_PICKER } from '../../utils/prepareImageUpload';
import { showPermissionDenied } from '../../utils/permissionPrompt';
import { feedback, hushNativeAudio } from '../../utils/interactionFeedback';
import { alertMessage } from '../../utils/confirmDialog';
import { scrollInputIntoView } from '../../utils/scrollInputIntoView';
import ProofSheet from '../proof/ProofSheet';
import { KIND_META, homeworkNoteForProof } from '../proof/proofDefaults';
import type { Proof } from '../../services/api/proofs';
import type { AssignmentWithProof } from '../../services/api/coachq';

type Props = {
  visible: boolean;
  assignment: CoachingAssignment | null;
  onClose: () => void;
  /** Called after the check-in is saved so the plan can reload. */
  onDone: () => void;
};

/**
 * Client-side "Mark done" for coaching homework: optional note + optional
 * photo, saved as a check-in on the homework's backing record. When the coach
 * asked for a proof type, the proof sheet opens first; closing it falls back to
 * the note/photo form (proof is never required).
 */
export default function HomeworkDoneSheet({ visible, assignment, onClose, onDone }: Props) {
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const noteRef = useRef<TextInput>(null);
  const [busy, setBusy] = useState(false);
  const asked = (assignment as AssignmentWithProof | null)?.proof_kind ?? null;
  // 'proof' = ProofSheet showing, 'form' = note/photo form, 'switching' = neither
  // (one modal at a time).
  const [mode, setMode] = useState<'proof' | 'form' | 'switching'>('form');
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ProofSheet calls onSaved then onClose in the same tick: don't bounce to the form.
  const savingRef = useRef(false);

  // Fresh form for each homework item.
  useEffect(() => {
    if (visible) {
      setNote('');
      setPhotoUri(null);
      setMode(asked ? 'proof' : 'form');
    }
  }, [visible, assignment?.id, asked]);

  useEffect(
    () => () => {
      if (switchTimer.current) clearTimeout(switchTimer.current);
    },
    [],
  );

  if (!assignment) return null;

  // iOS can't present a modal while another is dismissing: wait for the slide-out.
  const switchTo = (next: 'proof' | 'form') => {
    if (switchTimer.current) clearTimeout(switchTimer.current);
    setMode('switching');
    switchTimer.current = setTimeout(() => setMode(next), 350);
  };

  /**
   * Proof saved under the assignment → complete the homework. The note is the
   * one the client typed in this sheet (kept across the proof sheet), never the
   * proof summary — the proof itself already shows next to the homework.
   */
  const completeWithProof = async (_proof: Proof) => {
    savingRef.current = true;
    setBusy(true);
    try {
      await waterSeed(assignment.seed_id, {
        action: 'check_in',
        note: homeworkNoteForProof(note),
        assignment_id: assignment.id,
      });
      feedback.success();
      onClose();
      onDone();
    } catch (e) {
      feedback.error();
      void alertMessage(
        'Proof saved',
        e instanceof Error ? `${e.message} — tap Mark done to finish.` : 'Tap Mark done to finish.',
      );
      switchTo('form');
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  };

  const applyPicked = (result: ImagePicker.ImagePickerResult) => {
    hushNativeAudio();
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
      feedback.select();
    }
  };

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        await showPermissionDenied('photos', {
          canAskAgain: perm.canAskAgain,
          message: 'Allow photo access to add a photo to your homework.',
        });
        return;
      }
      applyPicked(await ImagePicker.launchImageLibraryAsync(FAST_IMAGE_PICKER));
    } catch {
      void alertMessage('Could not add photo', 'Try another photo, or use the camera.');
    }
  };

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        await showPermissionDenied('camera', {
          canAskAgain: perm.canAskAgain,
          message: 'Allow camera access to take a photo of your homework.',
        });
        return;
      }
      applyPicked(
        await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.72, exif: false }),
      );
    } catch {
      void alertMessage('Camera unavailable', 'Use your photo library instead, or try again.');
    }
  };

  const submit = async () => {
    if (busy) return;
    Keyboard.dismiss();
    hushNativeAudio();
    setBusy(true);
    try {
      let photo_url: string | undefined;
      if (photoUri) {
        const uploaded = await uploadMediaFile(photoUri, 'post');
        photo_url = uploaded.url;
      }
      await waterSeed(assignment.seed_id, {
        action: 'check_in',
        note: note.trim() || undefined,
        photo_url,
        assignment_id: assignment.id,
      });
      feedback.success();
      onClose();
      onDone();
    } catch (e) {
      feedback.error();
      void alertMessage('Could not mark done', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {asked ? (
        <ProofSheet
          visible={visible && mode === 'proof'}
          onClose={() => {
            if (!busy && !savingRef.current) switchTo('form');
          }}
          requestedKind={asked}
          path={
            assignment.seed?.category_key
              ? assignment.seed.subcategory_key
                ? `${assignment.seed.category_key}:${assignment.seed.subcategory_key}`
                : assignment.seed.category_key
              : null
          }
          context={{ type: 'assignment', id: assignment.id }}
          shareWithCoachDefault
          title={assignment.title}
          onSaved={(p) => void completeWithProof(p)}
        />
      ) : null}
      <Modal
        visible={visible && mode === 'form'}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!busy) onClose();
        }}
      >
        <KeyboardInsetView
          style={tw`flex-1 justify-end bg-black/40`}
          contentStyle={tw`justify-end`}
        >
          <PressableScale
            onPress={() => {
              if (!busy) onClose();
            }}
            feedback="close"
            style={tw`flex-1`}
            accessibilityLabel="Dismiss"
          />
          <View style={tw`bg-page rounded-t-sheet px-gutter-wide pt-3 pb-8 max-h-[88%]`}>
            <View style={tw`w-10 h-1 rounded-full bg-stone-300 self-center mb-4`} />
            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
              <Text
                style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase`}
              >
                Mark done
              </Text>
              <Text style={tw`text-xl font-bold text-ink mt-0.5`}>{assignment.title}</Text>
              <Text style={tw`text-sm text-ink-3 mt-1 mb-4 leading-5`}>
                Add a photo or a short note so your coach can see how it went. Both are optional.
              </Text>

              {asked ? (
                <PressableScale
                  onPress={() => switchTo('proof')}
                  disabled={busy}
                  feedback="open"
                  accessibilityRole="button"
                  accessibilityLabel={`Add a ${KIND_META[asked].label.toLowerCase()} proof`}
                  style={tw`mb-3 px-3.5 py-3 rounded-card bg-emerald-50 border border-emerald-100 flex-row items-center`}
                >
                  <Ionicons
                    name={KIND_META[asked].icon as keyof typeof Ionicons.glyphMap}
                    size={18}
                    color={tw.color('emerald-700')}
                  />
                  <View style={tw`flex-1 ml-2.5`}>
                    <Text style={tw`text-body font-semibold text-emerald-800`}>
                      Your coach asked for a {KIND_META[asked].label.toLowerCase()}
                    </Text>
                    <Text style={tw`text-footnote text-emerald-800/80`}>
                      {note.trim()
                        ? 'Tap to add it — your note is sent with it.'
                        : 'Tap to add it — or just leave a note.'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={tw.color('emerald-700')} />
                </PressableScale>
              ) : null}

              {photoUri ? (
                <View style={tw`mb-3 rounded-card overflow-hidden border border-line`}>
                  <Image source={{ uri: photoUri }} style={tw`w-full h-44`} contentFit="cover" />
                  <PressableScale
                    hitSlop={6}
                    onPress={() => setPhotoUri(null)}
                    feedback="close"
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    style={tw`absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 items-center justify-center`}
                  >
                    <Ionicons name="close" size={16} color="#fff" />
                  </PressableScale>
                </View>
              ) : (
                <View style={tw`flex-row gap-2 mb-3`}>
                  <PressableScale
                    onPress={() => void takePhoto()}
                    disabled={busy}
                    feedback="open"
                    accessibilityRole="button"
                    accessibilityLabel="Take a photo"
                    style={tw`flex-1 py-3 rounded-card bg-ink items-center flex-row justify-center gap-2`}
                  >
                    <Ionicons name="camera-outline" size={18} color={theme.colors.page} />
                    <Text style={tw`text-page font-bold`}>Camera</Text>
                  </PressableScale>
                  <PressableScale
                    onPress={() => void pickPhoto()}
                    disabled={busy}
                    feedback="open"
                    accessibilityRole="button"
                    accessibilityLabel="Choose a photo"
                    style={tw`flex-1 py-3 rounded-card bg-raised border border-line items-center flex-row justify-center gap-2`}
                  >
                    <Ionicons name="images-outline" size={18} color={theme.colors.ink} />
                    <Text style={tw`text-ink font-bold`}>Library</Text>
                  </PressableScale>
                </View>
              )}

              <TextInput
                ref={noteRef}
                value={note}
                onChangeText={setNote}
                onFocus={() => scrollInputIntoView(scrollRef, noteRef)}
                placeholder="Note for your coach (optional)"
                placeholderTextColor={theme.colors.placeholder}
                multiline
                maxLength={500}
                editable={!busy}
                style={tw`bg-card border border-line/80 rounded-card px-3.5 py-3 text-body text-ink min-h-[72px] max-h-40 mb-4`}
                textAlignVertical="top"
              />

              <PressableScale
                onPress={() => void submit()}
                disabled={busy}
                feedback={false}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                style={tw`py-3.5 rounded-card bg-emerald-600 items-center flex-row justify-center gap-2 ${
                  busy ? 'opacity-60' : ''
                }`}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                )}
                <Text style={tw`text-white font-bold`}>{busy ? 'Saving…' : 'Mark done'}</Text>
              </PressableScale>
              <PressableScale
                onPress={() => {
                  if (!busy) onClose();
                }}
                style={tw`py-3 items-center mt-1`}
              >
                <Text style={tw`text-ink-3 font-semibold`}>Cancel</Text>
              </PressableScale>
            </ScrollView>
          </View>
        </KeyboardInsetView>
      </Modal>
    </>
  );
}
