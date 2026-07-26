import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import CATEGORIES from '../../data/categories';
import { horizontalScrollProps } from '../../constants/scroll';
import type { JournalMood } from '../../services/api/journal';
import { triggerPressFeedback } from '../../utils/interactionFeedback';
import {
  ALL_MOODS,
  MOOD_META,
  PRIMARY_MOODS,
  formatHeroDate,
  promptForDay,
  tagsWithGrowthPath,
} from './journalMeta';

type Props = {
  visible: boolean;
  isSaving: boolean;
  initialPrompt?: string;
  preferredPath?: string | null;
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
  onClose,
  onSave,
}: Props) {
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<JournalMood | null>(null);
  const [path, setPath] = useState<string | null>(preferredPath ?? null);
  const [isPublic, setIsPublic] = useState(false);
  const [showAllMoods, setShowAllMoods] = useState(false);

  const prompt = useMemo(
    () => initialPrompt || promptForDay(new Date(), path),
    [initialPrompt, path]
  );

  useEffect(() => {
    if (!visible) return;
    setContent('');
    setMood(null);
    setPath(preferredPath ?? null);
    setIsPublic(false);
    setShowAllMoods(false);
  }, [visible, preferredPath]);

  const moods = showAllMoods ? ALL_MOODS : PRIMARY_MOODS;
  const wash = mood ? MOOD_META[mood].wash : '#F5F0E8';

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
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[tw`flex-1`, { backgroundColor: wash }]}>
        <SafeAreaView style={tw`flex-1`} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            style={tw`flex-1`}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={tw`px-5 pt-2 pb-3 flex-row items-center justify-between`}>
              <Pressable onPress={onClose} hitSlop={12} style={tw`p-1`}>
                <Ionicons name="close" size={26} color="#44403C" />
              </Pressable>
              <Text style={tw`text-sm font-medium text-stone-500`}>{formatHeroDate()}</Text>
              <Pressable
                onPress={submit}
                disabled={!content.trim() || isSaving}
                style={tw`px-4 py-2 rounded-full bg-stone-900 ${
                  !content.trim() || isSaving ? 'opacity-40' : ''
                }`}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={tw`text-white font-semibold text-sm`}>Save</Text>
                )}
              </Pressable>
            </View>

            <ScrollView
              style={tw`flex-1`}
              contentContainerStyle={tw`px-5 pb-10`}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={tw`text-2xl text-stone-900 leading-8 mb-6`} numberOfLines={3}>
                {prompt}
              </Text>

              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder="Write freely…"
                placeholderTextColor="#A8A29E"
                multiline
                autoFocus
                style={tw`min-h-48 text-lg text-stone-900 leading-7 mb-8`}
                textAlignVertical="top"
              />

              <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
                Mood
              </Text>
              <ScrollView horizontal {...horizontalScrollProps} style={tw`mb-2`}>
                <View style={tw`flex-row items-center gap-2 pr-4`}>
                  {moods.map((key) => {
                    const meta = MOOD_META[key];
                    const selected = mood === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => {
                          triggerPressFeedback();
                          setMood(selected ? null : key);
                        }}
                        style={[
                          tw`flex-row items-center px-3.5 py-2 rounded-full border`,
                          selected
                            ? { backgroundColor: meta.color, borderColor: meta.color }
                            : tw`bg-white/70 border-stone-200`,
                        ]}
                      >
                        <Text style={tw`text-base mr-1.5`}>{meta.glyph}</Text>
                        <Text style={tw`text-sm ${selected ? 'text-white font-semibold' : 'text-stone-700'}`}>
                          {meta.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    onPress={() => setShowAllMoods((v) => !v)}
                    style={tw`px-3 py-2 rounded-full bg-white/70 border border-stone-200`}
                  >
                    <Text style={tw`text-sm text-stone-600`}>
                      {showAllMoods ? 'Less' : 'More'}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>

              <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-3 mt-5`}>
                Growth path
              </Text>
              <ScrollView horizontal {...horizontalScrollProps} style={tw`mb-6`}>
                <View style={tw`flex-row items-center gap-2 pr-4`}>
                  {CATEGORIES.slice(0, 10).map((cat) => {
                    const selected = path === cat.key;
                    return (
                      <Pressable
                        key={cat.key}
                        onPress={() => {
                          triggerPressFeedback();
                          setPath(selected ? null : cat.key);
                        }}
                        style={tw`flex-row items-center px-3.5 py-2 rounded-full border ${
                          selected
                            ? 'bg-stone-900 border-stone-900'
                            : 'bg-white/70 border-stone-200'
                        }`}
                      >
                        <Ionicons
                          name={cat.icon as keyof typeof Ionicons.glyphMap}
                          size={14}
                          color={selected ? '#fff' : '#57534E'}
                        />
                        <Text
                          style={tw`text-sm ml-1.5 ${
                            selected ? 'text-white font-semibold' : 'text-stone-700'
                          }`}
                        >
                          {cat.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              <Pressable
                onPress={() => {
                  triggerPressFeedback();
                  setIsPublic((v) => !v);
                }}
                style={tw`flex-row items-center justify-between bg-white/80 border border-stone-200 rounded-2xl px-4 py-3.5`}
              >
                <View style={tw`flex-row items-center flex-1 pr-3`}>
                  <Ionicons
                    name={isPublic ? 'globe-outline' : 'lock-closed-outline'}
                    size={20}
                    color="#44403C"
                  />
                  <View style={tw`ml-3`}>
                    <Text style={tw`text-stone-900 font-semibold`}>
                      {isPublic ? 'Shared on profile' : 'Private'}
                    </Text>
                    <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                      {isPublic
                        ? 'Visible on your public Journal tab'
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
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
