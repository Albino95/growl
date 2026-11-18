import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { getEngageSummary, type EngageSummary } from '../../services/api/engage';

/** BizSettings block: entries to Questions & reviews and Inbox settings. */
export default function EngageSettingsRows({
  onOpenQuestions,
  onOpenInbox,
}: {
  onOpenQuestions: () => void;
  onOpenInbox: () => void;
}) {
  const [summary, setSummary] = useState<EngageSummary | null>(null);
  useEffect(() => {
    void getEngageSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);
  const waiting = (summary?.unanswered_questions ?? 0) + (summary?.unreplied_reviews ?? 0);

  return (
    <View style={tw`px-gutter-wide py-4 border-b border-line/70`}>
      <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-3`}>Customers</Text>
      <PressableScale
        style={tw`flex-row items-center justify-between py-3 border-b border-line/60`}
        onPress={onOpenQuestions}
        accessibilityRole="button"
        accessibilityLabel={waiting > 0 ? `Questions and reviews, ${waiting} waiting` : 'Questions and reviews'}
      >
        <View style={tw`flex-row items-center flex-1`}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.colors.ink3} />
          <Text style={tw`text-ink ml-3`}>Questions & reviews</Text>
        </View>
        {waiting > 0 ? (
          <View style={tw`px-2 h-5 rounded-full bg-brand-600 items-center justify-center mr-2`}>
            <Text style={tw`text-[11px] font-bold text-white`}>{waiting > 99 ? '99+' : waiting}</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={20} color={theme.colors.iconMuted} />
      </PressableScale>
      <PressableScale
        style={tw`flex-row items-center justify-between py-3`}
        onPress={onOpenInbox}
        accessibilityRole="button"
      >
        <View style={tw`flex-row items-center flex-1`}>
          <Ionicons name="bookmark-outline" size={20} color={theme.colors.ink3} />
          <View style={tw`ml-3 flex-1`}>
            <Text style={tw`text-ink`}>Inbox: saved replies & away</Text>
            <Text style={tw`text-xs text-ink-3 mt-0.5`}>Quick answers in chats, and an automatic away message</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.iconMuted} />
      </PressableScale>
    </View>
  );
}
