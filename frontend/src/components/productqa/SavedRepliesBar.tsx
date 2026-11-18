import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { getInboxSettings, type SavedReply } from '../../services/api/engage';

/**
 * "Saved replies" button above a business's chat composer. Picking one hands the text
 * to `onInsert` (the composer decides how to merge it). Renders nothing on servers
 * without the feature.
 */
export default function SavedRepliesBar({
  onInsert,
  textColor,
  chipColor,
}: {
  onInsert: (text: string) => void;
  /** Composer chrome colours (chat wallpapers can be dark). */
  textColor?: string;
  chipColor?: string;
}) {
  const insets = useSafeAreaInsets();
  const [replies, setReplies] = useState<SavedReply[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await getInboxSettings();
      setReplies(s ? s.saved_replies : null);
    } catch {
      setReplies((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (replies === null) return null;

  return (
    <View style={tw`flex-row mb-2`}>
      <PressableScale
        onPress={() => {
          setOpen(true);
          void load();
        }}
        feedback="open"
        accessibilityRole="button"
        accessibilityLabel="Saved replies"
        style={[tw`flex-row items-center px-3 py-1.5 rounded-chip`, { backgroundColor: chipColor ?? theme.colors.raised }]}
      >
        <Ionicons name="bookmark-outline" size={14} color={textColor ?? theme.colors.ink2} />
        <Text style={[tw`ml-1.5 text-caption font-semibold`, { color: textColor ?? theme.colors.ink2 }]}>
          Saved replies
        </Text>
      </PressableScale>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={tw`flex-1 bg-black/40`} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[tw`bg-page rounded-t-sheet px-gutter pt-4 max-h-[70%]`, { paddingBottom: insets.bottom + 16 }]}>
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <Text style={tw`text-title font-bold text-ink`}>Saved replies</Text>
            <PressableScale
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              style={tw`w-9 h-9 rounded-full bg-raised items-center justify-center`}
            >
              <Ionicons name="close" size={18} color={theme.colors.ink} />
            </PressableScale>
          </View>
          {replies.length === 0 ? (
            <Text style={tw`text-footnote text-ink-3 leading-5 py-4`}>
              No saved replies yet. Add them in Settings → Inbox: saved replies & away.
            </Text>
          ) : (
            <ScrollView>
              {replies.map((r) => (
                <PressableScale
                  key={r.id}
                  onPress={() => {
                    setOpen(false);
                    onInsert(r.body);
                  }}
                  feedback="select"
                  accessibilityRole="button"
                  accessibilityLabel={`Insert ${r.title}`}
                  style={tw`py-3 border-b border-line/60`}
                >
                  <Text style={tw`text-body font-semibold text-ink`}>{r.title}</Text>
                  <Text style={tw`text-footnote text-ink-3 mt-0.5`} numberOfLines={2}>
                    {r.body}
                  </Text>
                </PressableScale>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}
