import React, { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw, { useColorSchemeName, useThemeColors } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import CATEGORIES from '../../data/categories';
import { horizontalScrollProps } from '../../constants/scroll';
import type { JournalMood } from '../../services/api/journal';
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
  moodWash,
  promptForDay,
  tagsWithGrowthPath,
} from './journalMeta';
import GoingPublicSheet from './GoingPublicSheet';

type Props = {
  visible: boolean;
  isSaving: boolean;
  initialPrompt?: string;
  preferredPath?: string | null;
  /** Prefill from the Today check-in ("Write more"). Applied each time the modal opens. */
  initialMood?: JournalMood | null;
  initialContent?: string | null;
  onClose: () => void;
  onSave: (payload: {
    content: string;
    mood?: JournalMood;
    is_public: boolean;
    tags: string[];
    metadata?: Record<string, unknown>;
  }) => void;
};

export default function JournalComposeModal({
  visible,
  isSaving,
  initialPrompt,
  preferredPath,
  initialMood,
  initialContent,
  onClose,
  onSave,
}: Props) {
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<JournalMood | null>(null);
  const [path, setPath] = useState<string | null>(preferredPath ?? null);
  const [isPublic, setIsPublic] = useState(false);
  const [publicConfirmOpen, setPublicConfirmOpen] = useState(false);
  const [showAllMoods, setShowAllMoods] = useState(false);
  const c = useThemeColors();
  const scheme = useColorSchemeName();

  const prompt = useMemo(
    () => initialPrompt || promptForDay(new Date(), path),
    [initialPrompt, path]
  );

  useEffect(() => {
    if (!visible) return;
    setContent(initialContent ?? '');
    setMood(initialMood ?? null);
    setPath(preferredPath ?? null);
    setIsPublic(false);
    setPublicConfirmOpen(false);
    setShowAllMoods(!!initialMood && !PRIMARY_MOODS.includes(initialMood));
  }, [visible, preferredPath, initialMood, initialContent]);

  const insets = useSafeAreaInsets();
  // Modals often report 0 safe-area insets, which parks the header under the status bar / battery.
  const topPad = Math.max(insets.top, Platform.OS === 'ios' ? 54 : StatusBar.currentHeight || 24);
  const bottomPad = Math.max(insets.bottom, 12);
  const moods = showAllMoods ? ALL_MOODS : PRIMARY_MOODS;
  const wash = mood ? moodWash(mood, scheme) : c.page;

  const submit = () => {
    if (!content.trim() || isSaving) return;
    triggerPressFeedback();
    onSave({
      content: content.trim(),
      mood: mood ?? undefined,
      is_public: isPublic,
      tags: tagsWithGrowthPath(path),
      metadata: path ? { growth_path: path } : {},
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[tw`flex-1`, { backgroundColor: wash, paddingTop: topPad, paddingBottom: bottomPad }]}>
        <View style={tw`px-gutter pb-3 flex-row items-center justify-between`}>
          <PressableScale
            onPress={onClose}
            pressedScale={0.9}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Close journal"
            style={tw`w-11 h-11 rounded-full bg-card/80 border border-line items-center justify-center`}
          >
            <Ionicons name="close" size={22} color={c.ink2} />
          </PressableScale>
          <Text style={tw`text-sm font-medium text-ink-3`}>{formatHeroDate()}</Text>
          <PressableScale
            onPress={submit}
            disabled={!content.trim() || isSaving}
            feedback="commit"
            accessibilityRole="button"
            accessibilityLabel="Save journal entry"
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
              <Text style={tw`text-2xl text-ink leading-8 mb-6`} numberOfLines={3}>
                {prompt}
              </Text>

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
