import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw, { useColorSchemeName, useThemeColors } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import CATEGORIES from '../../data/categories';
import { horizontalScrollProps } from '../../constants/scroll';
import type { JournalEntry, JournalMood } from '../../services/api/journal';
import { triggerPressFeedback } from '../../utils/interactionFeedback';
import {
  KeyboardDoneAccessory,
  formInputAccessoryProps,
} from '../ui/KeyboardDoneAccessory';
import {
  ALL_MOODS,
  MOOD_META,
  PRIMARY_MOODS,
  formatHeroDate,
  growthPathFromTags,
  moodWash,
  promptForDay,
  tagsWithGrowthPath,
} from './journalMeta';
import GoingPublicSheet from './GoingPublicSheet';
import { useAuth } from '../../store/hooks';
import { confirmAsync } from '../../utils/confirmDialog';
import {
  JOURNAL_DRAFT_NS,
  drafts,
  newIdempotencyKey,
  type JournalDraft,
} from '../../services/drafts';
import { isValidIdempotencyKey } from '../../services/api/idempotency';

const AUTOSAVE_MS = 800;

export type JournalComposePayload = {
  content: string;
  mood?: JournalMood;
  is_public: boolean;
  tags: string[];
  metadata?: Record<string, unknown>;
  /** Stable for this compose session (and its restored draft). */
  idempotencyKey: string;
  /** Set when editing an existing entry. */
  entryId?: string;
};

type Props = {
  visible: boolean;
  isSaving: boolean;
  initialPrompt?: string;
  preferredPath?: string | null;
  /** Prefill from the Today check-in ("Write more"). Applied each time the modal opens. */
  initialMood?: JournalMood | null;
  initialContent?: string | null;
  /** Edit mode: prefill from this entry and save as an update (no draft autosave). */
  editingEntry?: JournalEntry | null;
  onClose: () => void;
  onSave: (payload: JournalComposePayload) => void;
};

export default function JournalComposeModal({
  visible,
  isSaving,
  initialPrompt,
  preferredPath,
  initialMood,
  initialContent,
  editingEntry,
  onClose,
  onSave,
}: Props) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<JournalMood | null>(null);
  const [path, setPath] = useState<string | null>(preferredPath ?? null);
  const [isPublic, setIsPublic] = useState(false);
  const [publicConfirmOpen, setPublicConfirmOpen] = useState(false);
  const [showAllMoods, setShowAllMoods] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  /** False until the stored draft has been checked — autosave waits for it. */
  const [hydrated, setHydrated] = useState(false);
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);
  const isEditing = !!editingEntry;
  const c = useThemeColors();
  const scheme = useColorSchemeName();

  const prompt = useMemo(
    () => initialPrompt || promptForDay(new Date(), path),
    [initialPrompt, path]
  );

  const cancelAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = null;
  }, []);

  useEffect(() => {
    if (!visible) {
      cancelAutosave();
      setHydrated(false);
      return;
    }
    submittedRef.current = false;
    setPublicConfirmOpen(false);
    setDraftRestored(false);

    if (editingEntry) {
      const entryMood = (editingEntry.mood as JournalMood | null) ?? null;
      setContent(editingEntry.content ?? '');
      setMood(entryMood);
      setPath(growthPathFromTags(editingEntry.tags || []));
      setIsPublic(!!(editingEntry.isPublic ?? editingEntry.is_public));
      setShowAllMoods(!!entryMood && !PRIMARY_MOODS.includes(entryMood));
      setHydrated(true);
      return;
    }

    idempotencyKeyRef.current = newIdempotencyKey();
    setContent(initialContent ?? '');
    setMood(initialMood ?? null);
    setPath(preferredPath ?? null);
    setIsPublic(false);
    setShowAllMoods(!!initialMood && !PRIMARY_MOODS.includes(initialMood));

    // A prefill from the Today check-in wins; otherwise pick up where they left off.
    if (initialContent?.trim()) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    void drafts.load<JournalDraft>(JOURNAL_DRAFT_NS, userId).then((saved) => {
      if (cancelled) return;
      const d = saved?.data;
      if (d && typeof d.content === 'string' && d.content.trim()) {
        const draftMood = (d.mood as JournalMood | null) ?? null;
        setContent(d.content);
        setMood(draftMood);
        setPath(d.path ?? null);
        setIsPublic(!!d.isPublic);
        setShowAllMoods(!!draftMood && !PRIMARY_MOODS.includes(draftMood));
        if (isValidIdempotencyKey(d.idempotencyKey)) idempotencyKeyRef.current = d.idempotencyKey;
        setDraftRestored(true);
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, preferredPath, initialMood, initialContent, editingEntry, userId, cancelAutosave]);

  // --- draft autosave (new entries only) ------------------------------------
  const latestDraft = useRef<JournalDraft | null>(null);
  latestDraft.current = {
    content,
    mood,
    path,
    isPublic,
    idempotencyKey: idempotencyKeyRef.current,
  };

  const flushDraft = useCallback(() => {
    cancelAutosave();
    const d = latestDraft.current;
    if (!d || submittedRef.current) return;
    if (d.content.trim()) void drafts.save(JOURNAL_DRAFT_NS, userId, d);
    else void drafts.clear(JOURNAL_DRAFT_NS, userId);
  }, [cancelAutosave, userId]);

  useEffect(() => {
    if (!visible || isEditing || !hydrated || submittedRef.current) return;
    cancelAutosave();
    autosaveTimer.current = setTimeout(flushDraft, AUTOSAVE_MS);
    return cancelAutosave;
  }, [visible, isEditing, hydrated, content, mood, path, isPublic, flushDraft, cancelAutosave]);

  // Write right away if the app goes to the background mid-sentence.
  useEffect(() => {
    if (!visible || isEditing) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && hydrated) flushDraft();
    });
    return () => sub.remove();
  }, [visible, isEditing, hydrated, flushDraft]);

  const isDirty = useMemo(() => {
    if (!editingEntry) return !!content.trim();
    return (
      content.trim() !== (editingEntry.content ?? '').trim() ||
      (mood ?? null) !== ((editingEntry.mood as JournalMood | null) ?? null) ||
      path !== growthPathFromTags(editingEntry.tags || []) ||
      isPublic !== !!(editingEntry.isPublic ?? editingEntry.is_public)
    );
  }, [editingEntry, content, mood, path, isPublic]);

  const promptingRef = useRef(false);
  const requestClose = useCallback(async () => {
    if (isSaving) return;
    if (isDirty) {
      if (promptingRef.current) return;
      promptingRef.current = true;
      const discard = await confirmAsync(
        isEditing ? 'Discard your changes?' : 'Discard this entry?',
        isEditing ? 'The entry stays as it was.' : 'What you wrote here will be lost.',
        { confirmLabel: 'Discard', cancelLabel: 'Keep writing', destructive: true }
      ).finally(() => {
        promptingRef.current = false;
      });
      if (!discard) return;
    }
    cancelAutosave();
    if (!isEditing) void drafts.clear(JOURNAL_DRAFT_NS, userId);
    onClose();
  }, [isSaving, isDirty, isEditing, cancelAutosave, userId, onClose]);

  const insets = useSafeAreaInsets();
  // Modals often report 0 safe-area insets, which parks the header under the status bar / battery.
  const topPad = Math.max(insets.top, Platform.OS === 'ios' ? 54 : StatusBar.currentHeight || 24);
  const bottomPad = Math.max(insets.bottom, 12);
  const moods = showAllMoods ? ALL_MOODS : PRIMARY_MOODS;
  const wash = mood ? moodWash(mood, scheme) : c.page;

  const submit = () => {
    if (!content.trim() || isSaving) return;
    triggerPressFeedback();
    // Stop autosave so a late write can't resurrect the draft after it's cleared.
    cancelAutosave();
    if (!isEditing) submittedRef.current = true;
    const baseMeta = { ...((editingEntry?.metadata as Record<string, unknown> | undefined) || {}) };
    delete baseMeta.growth_path;
    onSave({
      content: content.trim(),
      mood: mood ?? undefined,
      is_public: isPublic,
      tags: tagsWithGrowthPath(path, editingEntry?.tags || []),
      metadata: path ? { ...baseMeta, growth_path: path } : baseMeta,
      idempotencyKey: idempotencyKeyRef.current,
      entryId: editingEntry?.id,
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => void requestClose()}
    >
      <View style={[tw`flex-1`, { backgroundColor: wash, paddingTop: topPad, paddingBottom: bottomPad }]}>
        <View style={tw`px-gutter pb-3 flex-row items-center justify-between`}>
          <PressableScale
            onPress={() => void requestClose()}
            pressedScale={0.9}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Close journal"
            style={tw`w-11 h-11 rounded-full bg-card/80 border border-line items-center justify-center`}
          >
            <Ionicons name="close" size={22} color={c.ink2} />
          </PressableScale>
          <Text style={tw`text-sm font-medium text-ink-3`}>
            {isEditing ? 'Edit entry' : formatHeroDate()}
          </Text>
          <PressableScale
            onPress={submit}
            disabled={!content.trim() || isSaving}
            feedback="commit"
            accessibilityRole="button"
            accessibilityLabel={isEditing ? 'Save changes' : 'Save journal entry'}
            style={tw`min-w-[72px] h-11 px-4 rounded-full bg-ink items-center justify-center ${
              !content.trim() || isSaving ? 'opacity-40' : ''
            }`}
          >
            {isSaving ? (
              <ActivityIndicator color={c.page} size="small" />
            ) : (
              <Text style={tw`text-page font-semibold text-sm`}>Save</Text>
            )}
          </PressableScale>
        </View>

        <KeyboardAvoidingView
          style={tw`flex-1`}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
              style={tw`flex-1`}
              contentContainerStyle={tw`px-gutter-wide pb-10`}
              keyboardShouldPersistTaps="handled"
            >
              {isEditing ? null : (
                <Text
                  style={tw`text-2xl text-ink leading-8 ${draftRestored ? 'mb-2' : 'mb-6'}`}
                  numberOfLines={3}
                >
                  {prompt}
                </Text>
              )}
              {draftRestored && !isEditing ? (
                <View style={tw`flex-row items-center mb-5`}>
                  <Ionicons name="refresh-outline" size={13} color={c.ink3} />
                  <Text style={tw`text-footnote text-ink-3 ml-1.5`}>Draft restored</Text>
                </View>
              ) : null}

              <TextInput
                {...formInputAccessoryProps({ multiline: true })}
                value={content}
                onChangeText={setContent}
                placeholder="Write freely…"
                placeholderTextColor={c.placeholder}
                multiline
                autoFocus
                style={tw`min-h-48 text-lg text-ink leading-7 mb-8`}
                textAlignVertical="top"
              />

              <Text style={tw`text-xs font-semibold tracking-widest text-ink-3 uppercase mb-3`}>
                Mood
              </Text>
              <ScrollView horizontal {...horizontalScrollProps} style={tw`mb-2`}>
                <View style={tw`flex-row items-center gap-2 pr-4`}>
                  {moods.map((key) => {
                    const meta = MOOD_META[key];
                    const selected = mood === key;
                    return (
                      <PressableScale
                        key={key}
                        onPress={() => {
                          triggerPressFeedback();
                          setMood(selected ? null : key);
                        }}
                        style={[
                          tw`flex-row items-center px-3.5 py-2 rounded-full border`,
                          selected
                            ? { backgroundColor: meta.color, borderColor: meta.color }
                            : tw`bg-card/70 border-line`,
                        ]}
                      >
                        <Text style={tw`text-base mr-1.5`}>{meta.glyph}</Text>
                        <Text style={tw`text-sm ${selected ? 'text-white font-semibold' : 'text-ink-2'}`}>
                          {meta.label}
                        </Text>
                      </PressableScale>
                    );
                  })}
                  <PressableScale
                    onPress={() => setShowAllMoods((v) => !v)}
                    style={tw`px-3 py-2 rounded-full bg-card/70 border border-line`}
                  >
                    <Text style={tw`text-sm text-ink-2`}>
                      {showAllMoods ? 'Less' : 'More'}
                    </Text>
                  </PressableScale>
                </View>
              </ScrollView>

              <Text style={tw`text-xs font-semibold tracking-widest text-ink-3 uppercase mb-3 mt-5`}>
                Growth path
              </Text>
              <ScrollView horizontal {...horizontalScrollProps} style={tw`mb-6`}>
                <View style={tw`flex-row items-center gap-2 pr-4`}>
                  {CATEGORIES.slice(0, 10).map((cat) => {
                    const selected = path === cat.key;
                    return (
                      <PressableScale
                        key={cat.key}
                        onPress={() => {
                          triggerPressFeedback();
                          setPath(selected ? null : cat.key);
                        }}
                        style={tw`flex-row items-center px-3.5 py-2 rounded-full border ${
                          selected
                            ? 'bg-ink border-ink'
                            : 'bg-card/70 border-line'
                        }`}
                      >
                        <Ionicons
                          name={cat.icon as keyof typeof Ionicons.glyphMap}
                          size={14}
                          color={selected ? c.page : c.ink2}
                        />
                        <Text
                          style={tw`text-sm ml-1.5 ${
                            selected ? 'text-page font-semibold' : 'text-ink-2'
                          }`}
                        >
                          {cat.label}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              </ScrollView>

              <PressableScale
                pressedScale={0.98}
                onPress={() => {
                  triggerPressFeedback();
                  if (isPublic) {
                    setIsPublic(false);
                    return;
                  }
                  setPublicConfirmOpen(true);
                }}
                style={tw`flex-row items-center justify-between bg-card/80 border border-line rounded-card px-4 py-3.5`}
              >
                <View style={tw`flex-row items-center flex-1 pr-3`}>
                  <Ionicons
                    name={isPublic ? 'people-outline' : 'lock-closed-outline'}
                    size={20}
                    color={c.ink2}
                  />
                  <View style={tw`ml-3`}>
                    <Text style={tw`text-ink font-semibold`}>
                      {isPublic ? 'Shared with circle' : 'Private'}
                    </Text>
                    <Text style={tw`text-xs text-ink-3 mt-0.5`}>
                      {isPublic
                        ? 'Friends can see this in Circle and may message you'
                        : 'Only you can read this entry'}
                    </Text>
                  </View>
                </View>
                <View
                  style={tw`w-11 h-6 rounded-full justify-center ${
                    isPublic ? 'bg-emerald-600' : 'bg-stone-300'
                  }`}
                >
                  <View
                    style={[
                      tw`w-5 h-5 rounded-full bg-white`,
                      { marginLeft: isPublic ? 22 : 2 },
                    ]}
                  />
                </View>
              </PressableScale>
            </ScrollView>
        </KeyboardAvoidingView>
        <KeyboardDoneAccessory />
        <GoingPublicSheet
          visible={publicConfirmOpen}
          onCancel={() => setPublicConfirmOpen(false)}
          onConfirm={() => {
            setIsPublic(true);
            setPublicConfirmOpen(false);
          }}
        />
      </View>
    </Modal>
  );
}
