import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  Keyboard,
  Switch,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import tw, { theme } from '../../lib/tw';
import KeyboardInsetView from '../ui/KeyboardInsetView';
import PressableScale from '../ui/PressableScale';
import { haptic } from '../../theme/haptics';
import { toast } from '../../state/useToastStore';
import { useGrowthStore } from '../../state/useGrowthStore';
import { showPermissionDenied } from '../../utils/permissionPrompt';
import { scrollInputIntoView } from '../../utils/scrollInputIntoView';
import { newIdempotencyKey } from '../../services/api/idempotency';
import { listCoachingContracts } from '../../services/api/instructor';
import { isUploadCancelled } from '../../services/api/media';
import {
  createProof,
  isProofsUnavailable,
  MAX_PROOF_IMAGE_BYTES,
  uploadProofMedia,
  type Proof,
  type ProofKind,
} from '../../services/api/proofs';
import FocusTimer from './FocusTimer';
import NumberInput from './NumberInput';
import VoiceRecorder, { type VoiceTake } from './VoiceRecorder';
import {
  IDLE_TIMER,
  KIND_META,
  PROOF_NOTE_MAX,
  focusMinutes,
  orderedKinds,
  defaultKind,
  parseProofNumber,
  pauseTimer,
  timerElapsedMs,
  timerRunning,
  unitsForPath,
  voiceSeconds,
  coachShareCaption,
  isCohortAssignmentId,
  type FocusTimerState,
} from './proofDefaults';

export type ProofSheetProps = {
  visible: boolean;
  onClose: () => void;
  path?: string | null;
  requestedKind?: Proof['kind'];
  allowedKinds?: Proof['kind'][];
  context: { type: 'checkin' | 'assignment' | 'weekly'; id: string };
  shareWithCoachDefault?: boolean;
  title?: string;
  onSaved?: (p: Proof) => void;
};

type CoachInfo = { active: boolean; shareCheckins: boolean };

/** Small cache so opening the sheet twice doesn't refetch plans. */
let coachCache: { at: number; info: CoachInfo } | null = null;
const COACH_CACHE_MS = 5 * 60_000;

async function loadCoachInfo(): Promise<CoachInfo> {
  if (coachCache && Date.now() - coachCache.at < COACH_CACHE_MS) return coachCache.info;
  const plans = await listCoachingContracts();
  const now = Date.now();
  const active = plans.filter(
    (c) => c.role === 'client' && c.status === 'active' && (!c.ends_at || Date.parse(c.ends_at) > now)
  );
  const info = { active: active.length > 0, shareCheckins: active.some((c) => !!c.share_checkins) };
  coachCache = { at: now, info };
  return info;
}

type Photo = { uri: string };

const MAX_EDGE = 1600;

/**
 * Re-encode a camera photo as JPEG ≤ 1600 px at quality 0.7. Re-encoding drops
 * all EXIF (incl. GPS location). If it's still over the 1.5 MB cap, go smaller.
 */
async function compressProofPhoto(uri: string, width?: number, height?: number): Promise<string> {
  const pass = async (edge: number, compress: number) => {
    const long = Math.max(width || 0, height || 0);
    const actions: ImageManipulator.Action[] = [];
    if (long > edge && width && height) {
      const scale = edge / long;
      actions.push({ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } });
    } else if (!long) {
      actions.push({ resize: { width: edge } });
    }
    const out = await ImageManipulator.manipulateAsync(uri, actions, {
      compress,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return out.uri;
  };
  const first = await pass(MAX_EDGE, 0.7);
  if (Platform.OS === 'web') return first;
  try {
    const FileSystem = await import('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(first);
    if (info.exists && typeof info.size === 'number' && info.size > MAX_PROOF_IMAGE_BYTES) {
      return pass(1200, 0.55);
    }
  } catch {
    /* size unknown — the server enforces the cap */
  }
  return first;
}

/**
 * Optional "proof of progress" sheet: photo (camera first), focus timer,
 * number, one-line note or a short voice note. Never required — closing it
 * changes nothing. Saves with one idempotency key per sheet session, so a
 * retry after a lost response never makes a duplicate.
 */
export default function ProofSheet({
  visible,
  onClose,
  path,
  requestedKind,
  allowedKinds,
  context,
  shareWithCoachDefault,
  title,
  onSaved,
}: ProofSheetProps) {
  const kinds = useMemo(
    () => orderedKinds(path, allowedKinds, requestedKind),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, requestedKind, (allowedKinds || []).join(',')]
  );
  const units = useMemo(() => unitsForPath(path), [path]);

  const [kind, setKind] = useState<ProofKind>(() => defaultKind(path, allowedKinds, requestedKind));
  const [text, setText] = useState('');
  const [numberRaw, setNumberRaw] = useState('');
  const [unit, setUnit] = useState<string | null>(units[0] ?? null);
  const [timer, setTimer] = useState<FocusTimerState>(IDLE_TIMER);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [voice, setVoice] = useState<VoiceTake | null>(null);
  const [shareCoach, setShareCoach] = useState(false);
  const [shareFriends, setShareFriends] = useState(false);
  const [coach, setCoach] = useState<CoachInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const idemKey = useRef(`proof-${newIdempotencyKey()}`);
  const uploaded = useRef<{ uri: string; key: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const textRef = useRef<TextInput>(null);
  const numberRef = useRef<TextInput>(null);

  const isAssignment = context.type === 'assignment';
  const isCohortHomework = isAssignment && isCohortAssignmentId(context.id);

  // Fresh sheet session on every open.
  useEffect(() => {
    if (!visible) return undefined;
    setKind(defaultKind(path, allowedKinds, requestedKind));
    setText('');
    setNumberRaw('');
    setUnit(units[0] ?? null);
    setTimer(IDLE_TIMER);
    setPhoto(null);
    setVoice(null);
    setShareCoach(shareWithCoachDefault ?? isAssignment);
    setShareFriends(false);
    setErrorText(null);
    setProgress(null);
    idemKey.current = `proof-${newIdempotencyKey()}`;
    uploaded.current = null;
    let alive = true;
    if (isAssignment) {
      setCoach({ active: true, shareCheckins: true });
    } else {
      void loadCoachInfo()
        .then((info) => alive && setCoach(info))
        .catch(() => alive && setCoach({ active: false, shareCheckins: false }));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, context.type, context.id]);

  useEffect(() => () => abort.current?.abort(), []);

  const close = () => {
    if (busy) return;
    if (timerRunning(timer)) setTimer(pauseTimer(timer, Date.now()));
    onClose();
  };

  const pickKind = (k: ProofKind) => {
    if (busy || k === kind) return;
    haptic('selection');
    setErrorText(null);
    setKind(k);
  };

  const applyPicked = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets[0]?.uri) return;
    const a = result.assets[0];
    setPreparing(true);
    try {
      const uri = await compressProofPhoto(a.uri, a.width, a.height);
      setPhoto({ uri });
      haptic('selection');
    } catch {
      setErrorText('Couldn’t prepare that photo. Try again.');
    } finally {
      setPreparing(false);
    }
  };

  const takePhoto = async () => {
    setErrorText(null);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        await showPermissionDenied('camera', {
          canAskAgain: perm.canAskAgain,
          message: 'Allow camera access to take a proof photo.',
        });
        return;
      }
      await applyPicked(
        await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, exif: false, allowsEditing: false })
      );
    } catch {
      setErrorText('The camera isn’t available right now.');
    }
  };

  const pickFromLibrary = async () => {
    setErrorText(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        await showPermissionDenied('photos', {
          canAskAgain: perm.canAskAgain,
          message: 'Allow photo access to add a proof photo.',
        });
        return;
      }
      await applyPicked(
        await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, exif: false, allowsEditing: false })
      );
    } catch {
      setErrorText('Couldn’t open your photos.');
    }
  };

  /** Validation for the current kind → error copy, or null when ready. */
  const notReady = (): string | null => {
    switch (kind) {
      case 'note':
        return text.trim() ? null : 'Write one line first.';
      case 'number':
        return parseProofNumber(numberRaw) != null ? null : 'Add a number first.';
      case 'timer':
        return focusMinutes(timerElapsedMs(timer, Date.now())) > 0 ? null : 'Start the timer — save after at least 30 seconds.';
      case 'photo':
        return photo ? null : 'Take a photo first.';
      case 'voice':
        return voice ? null : 'Record a voice note first.';
    }
  };

  const save = async () => {
    if (busy || preparing) return;
    Keyboard.dismiss();
    const why = notReady();
    if (why) {
      haptic('warning');
      setErrorText(why);
      return;
    }
    setErrorText(null);
    setBusy(true);
    let savedTimer = timer;
    if (kind === 'timer' && timerRunning(timer)) {
      savedTimer = pauseTimer(timer, Date.now());
      setTimer(savedTimer);
    }
    try {
      let mediaKey: string | undefined;
      const fileUri = kind === 'photo' ? photo?.uri : kind === 'voice' ? voice?.uri : undefined;
      if (fileUri) {
        if (uploaded.current?.uri === fileUri) {
          mediaKey = uploaded.current.key;
        } else {
          abort.current = new AbortController();
          setProgress(0);
          const res = await uploadProofMedia(fileUri, kind === 'voice' ? 'voice' : 'photo', {
            signal: abort.current.signal,
            onProgress: (sent, total) => setProgress(total > 0 ? Math.min(1, sent / total) : null),
          });
          uploaded.current = { uri: fileUri, key: res.key };
          mediaKey = res.key;
        }
      }
      const line = text.replace(/\s+/g, ' ').trim().slice(0, PROOF_NOTE_MAX) || null;
      const { proof } = await createProof(
        {
          kind,
          text: kind === 'note' || kind === 'photo' ? line : null,
          number: kind === 'number' ? parseProofNumber(numberRaw) : null,
          unit: kind === 'number' ? unit : null,
          minutes: kind === 'timer' ? focusMinutes(timerElapsedMs(savedTimer, Date.now())) : null,
          duration_s: kind === 'voice' && voice ? voiceSeconds(voice.durationMs) : null,
          media_key: mediaKey ?? null,
          context_type: context.type,
          context_id: context.id,
          path: path ?? null,
          share_with_coach: coach?.active ? shareCoach : false,
          share_with_friends: shareFriends,
        },
        { idempotencyKey: idemKey.current }
      );
      if (context.type === 'checkin') useGrowthStore.getState().addProof(proof);
      haptic('success');
      toast.success('Proof added ✓');
      idemKey.current = `proof-${newIdempotencyKey()}`;
      uploaded.current = null;
      onSaved?.(proof);
      onClose();
    } catch (e) {
      if (isUploadCancelled(e)) return;
      haptic('error');
      setErrorText(
        isProofsUnavailable(e)
          ? 'Proof isn’t available yet — update the app later. Your check-in is saved.'
          : e instanceof Error && e.message
            ? `${e.message} Tap Save to try again.`
            : 'Couldn’t save just now. Tap Save to try again.'
      );
    } finally {
      setBusy(false);
      setProgress(null);
      abort.current = null;
    }
  };

  const saveLabel = busy
    ? progress != null && progress < 1
      ? `Uploading ${Math.round(progress * 100)}%`
      : 'Saving…'
    : kind === 'timer' && timerRunning(timer)
      ? 'Finish & save'
      : 'Save proof';

  const showCoachToggle = !!coach?.active;
  const coachHidden = showCoachToggle && shareCoach && !isAssignment && !coach?.shareCheckins;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardInsetView style={tw`flex-1 justify-end bg-black/40`} contentStyle={tw`justify-end`}>
        <PressableScale onPress={close} style={tw`flex-1`} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={tw`bg-page rounded-t-sheet px-gutter pt-3 pb-8 max-h-[90%]`}>
          <View style={tw`w-10 h-1 rounded-full bg-stone-300 self-center mb-3`} />
          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <View style={tw`flex-row items-start justify-between`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={tw`text-title font-bold text-ink`} accessibilityRole="header">
                  {title || 'Add proof'}
                </Text>
                <Text style={tw`text-footnote text-ink-3 mt-0.5`}>
                  Optional — a small “with proof” mark. Partly counts too.
                </Text>
              </View>
              <PressableScale
                onPress={close}
                disabled={busy}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={tw`w-8 h-8 rounded-full bg-raised items-center justify-center`}
              >
                <Ionicons name="close" size={18} color={theme.colors.ink2} />
              </PressableScale>
            </View>

            {kinds.length > 1 ? (
              <View style={tw`flex-row flex-wrap gap-2 mt-4`} accessibilityRole="tablist">
                {kinds.map((k) => {
                  const selected = k === kind;
                  return (
                    <PressableScale
                      key={k}
                      onPress={() => pickKind(k)}
                      disabled={busy}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      accessibilityLabel={KIND_META[k].label}
                      style={tw`flex-row items-center px-3 py-2 rounded-chip ${selected ? 'bg-emerald-600' : 'bg-raised'}`}
                    >
                      <Text style={tw`text-footnote mr-1`}>{KIND_META[k].emoji}</Text>
                      <Text style={tw`text-footnote font-semibold ${selected ? 'text-white' : 'text-ink-2'}`}>
                        {KIND_META[k].label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            ) : null}

            <View style={tw`mt-4 w-full min-w-0`}>
              {kind === 'photo' ? (
                photo ? (
                  <View style={tw`rounded-card overflow-hidden border border-line`}>
                    <Image source={{ uri: photo.uri }} style={tw`w-full h-56`} contentFit="cover" />
                    <PressableScale
                      onPress={() => {
                        setPhoto(null);
                        uploaded.current = null;
                      }}
                      disabled={busy}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Retake photo"
                      style={tw`absolute top-2 right-2 px-3 py-1.5 rounded-full bg-black/55 flex-row items-center`}
                    >
                      <Ionicons name="camera-reverse-outline" size={14} color="#FFFFFF" />
                      <Text style={tw`text-caption font-semibold text-white ml-1`}>Retake</Text>
                    </PressableScale>
                  </View>
                ) : (
                  <View>
                    <PressableScale
                      onPress={() => void takePhoto()}
                      disabled={busy || preparing}
                      feedback="open"
                      accessibilityRole="button"
                      accessibilityLabel="Take a proof photo"
                      style={tw`py-8 rounded-card bg-card border border-line/70 items-center justify-center`}
                    >
                      {preparing ? (
                        <ActivityIndicator color={theme.colors.brand} />
                      ) : (
                        <>
                          <Ionicons name="camera-outline" size={30} color={theme.colors.brand} />
                          <Text style={tw`text-body font-semibold text-ink mt-2`}>Take a photo now</Text>
                          <Text style={tw`text-caption text-ink-3 mt-0.5`}>Location is never saved</Text>
                        </>
                      )}
                    </PressableScale>
                    {requestedKind !== 'photo' ? (
                      <PressableScale
                        onPress={() => void pickFromLibrary()}
                        disabled={busy || preparing}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Choose from your photos"
                        style={tw`self-center mt-2.5 py-1`}
                      >
                        <Text style={tw`text-footnote font-semibold text-ink-3`}>or choose from your photos</Text>
                      </PressableScale>
                    ) : null}
                  </View>
                )
              ) : null}

              {kind === 'timer' ? <FocusTimer state={timer} onChange={setTimer} disabled={busy} /> : null}

              {kind === 'number' ? (
                <NumberInput
                  ref={numberRef}
                  value={numberRaw}
                  onChangeValue={setNumberRaw}
                  unit={unit}
                  onChangeUnit={setUnit}
                  units={units}
                  editable={!busy}
                  onFocus={() => scrollInputIntoView(scrollRef, numberRef)}
                />
              ) : null}

              {kind === 'voice' ? <VoiceRecorder take={voice} onTake={setVoice} disabled={busy} /> : null}

              {kind === 'note' || kind === 'photo' ? (
                <TextInput
                  ref={textRef}
                  value={text}
                  onChangeText={(t) => setText(t.replace(/\n/g, ' ').slice(0, PROOF_NOTE_MAX))}
                  onFocus={() => scrollInputIntoView(scrollRef, textRef)}
                  placeholder={kind === 'note' ? 'One line — what did you do?' : 'Add a line (optional)'}
                  placeholderTextColor={theme.colors.placeholder}
                  maxLength={PROOF_NOTE_MAX}
                  returnKeyType="done"
                  blurOnSubmit
                  editable={!busy}
                  accessibilityLabel={kind === 'note' ? 'Proof note, one line' : 'Photo caption, optional'}
                  style={tw`${kind === 'photo' ? 'mt-3' : ''} px-3.5 py-3 rounded-control bg-card border border-line text-body text-ink`}
                />
              ) : null}
            </View>

            {showCoachToggle ? (
              <View style={tw`flex-row items-center mt-5`}>
                <View style={tw`flex-1 pr-3`}>
                  <Text style={tw`text-body font-semibold text-ink`}>Share with my coach</Text>
                  <Text style={tw`text-caption text-ink-3 mt-0.5`}>
                    {coachHidden
                      ? 'Your coach sees check-in proofs once check-in sharing is on in your plan.'
                      : shareCoach
                        ? coachShareCaption(isCohortHomework)
                        : 'Private — only you see it.'}
                  </Text>
                </View>
                <Switch
                  value={shareCoach}
                  onValueChange={(v) => {
                    haptic(v ? 'toggleOn' : 'toggleOff');
                    setShareCoach(v);
                  }}
                  disabled={busy}
                  trackColor={{ true: theme.colors.brand, false: theme.colors.line }}
                  accessibilityLabel="Share this proof with my coach"
                />
              </View>
            ) : null}
            <View style={tw`flex-row items-center mt-4`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={tw`text-body font-semibold text-ink`}>Let friends & buddies see it</Text>
                <Text style={tw`text-caption text-ink-3 mt-0.5`}>Never posted publicly. They can cheer it.</Text>
              </View>
              <Switch
                value={shareFriends}
                onValueChange={(v) => {
                  haptic(v ? 'toggleOn' : 'toggleOff');
                  setShareFriends(v);
                }}
                disabled={busy}
                trackColor={{ true: theme.colors.brand, false: theme.colors.line }}
                accessibilityLabel="Let friends and buddies see this proof"
              />
            </View>

            {errorText ? (
              <Text style={tw`text-footnote text-ink-2 mt-4`} accessibilityLiveRegion="polite">
                {errorText}
              </Text>
            ) : null}

            <PressableScale
              onPress={() => void save()}
              disabled={busy || preparing}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || preparing, busy }}
              accessibilityLabel={saveLabel}
              style={tw`mt-5 py-3.5 rounded-control bg-emerald-600 flex-row items-center justify-center ${
                busy || preparing ? 'opacity-70' : ''
              }`}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" style={tw`mr-2`} /> : null}
              <Text style={tw`text-white font-bold text-body`}>{saveLabel}</Text>
            </PressableScale>
            {busy && progress != null ? (
              <PressableScale
                onPress={() => abort.current?.abort()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Cancel upload"
                style={tw`self-center mt-2 py-1`}
              >
                <Text style={tw`text-footnote font-semibold text-ink-3`}>Cancel upload</Text>
              </PressableScale>
            ) : (
              <PressableScale onPress={close} disabled={busy} style={tw`self-center mt-2 py-1`} accessibilityRole="button">
                <Text style={tw`text-footnote font-semibold text-ink-3`}>Not now</Text>
              </PressableScale>
            )}
          </ScrollView>
        </View>
      </KeyboardInsetView>
    </Modal>
  );
}
