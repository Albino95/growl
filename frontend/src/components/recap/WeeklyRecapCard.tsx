import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import WeekDots from './WeekDots';
import ShareCardSheet, { type ShareCardPayload } from '../share/ShareCardSheet';
import { useGrowthStore } from '../../state/useGrowthStore';
import { useAuth } from '../../store/hooks';
import { triggerFeedback } from '../../utils/interactionFeedback';
import { getCategoryMeta } from '../../utils/categoryLabels';
import { recapDayStatuses, recapStatChips, shouldShowRecap } from './growthMeta';

const pathLabel = (p: string) => getCategoryMeta(p).parentLabel;

/**
 * Mon–Wed recap of last week on Home. Dismissible per week (persisted in
 * useGrowthStore). Opens its own ShareCardSheet so the Feed header memo
 * doesn't need new deps.
 */
function WeeklyRecapCard() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const recap = useGrowthStore((s) => s.recap);
  const dismissedWeek = useGrowthStore((s) => s.dismissedRecapWeek);
  const [sharePayload, setSharePayload] = useState<ShareCardPayload | null>(null);

  const visible = shouldShowRecap(recap, dismissedWeek);
  const chips = useMemo(() => (recap ? recapStatChips(recap, pathLabel) : []), [recap]);
  const dots = useMemo(() => (recap ? recapDayStatuses(recap.days || []) : []), [recap]);

  if (!visible || !recap) {
    return sharePayload ? (
      <ShareCardSheet visible payload={sharePayload} onClose={() => setSharePayload(null)} />
    ) : null;
  }

  const dismiss = () => {
    triggerFeedback('close');
    useGrowthStore.getState().dismissRecap(recap.week);
  };

  const share = () => {
    triggerFeedback('open');
    setSharePayload({
      kind: 'recap',
      recap,
      userId: user?.id,
      username: user?.username,
      avatar: user?.avatar ?? null,
    });
  };

  const writeJournal = () => {
    triggerFeedback('open');
    navigation.navigate('Journal', { openCompose: true });
  };

  return (
    <View style={tw`mx-gutter mb-3 px-4 pt-4 pb-4 rounded-sheet bg-card border border-line`}>
      <View style={tw`flex-row items-start justify-between`}>
        <View style={tw`flex-1 pr-3`}>
          <Text style={tw`text-caption tracking-[2px] uppercase text-energy-700 font-semibold`}>
            {recap.is_first_week ? 'Your first week' : 'Last week'}
          </Text>
          <Text style={tw`text-callout font-bold text-ink mt-0.5`}>Your week in growth</Text>
        </View>
        <PressableScale
          feedback={false}
          onPress={dismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Hide this week’s recap"
        >
          <Ionicons name="close" size={18} color={theme.colors.iconMuted} />
        </PressableScale>
      </View>

      <View style={tw`mt-3`}>
        <WeekDots days={dots} size={12} showLabels />
      </View>

      {recap.empty ? (
        <>
          <Text style={tw`text-body text-ink-2 mt-3 leading-5`}>
            {recap.reflection || 'A quiet week is still part of growing.'}
          </Text>
          <PressableScale
            feedback={false}
            onPress={writeJournal}
            accessibilityRole="button"
            style={tw`mt-3 self-start px-4 py-2.5 rounded-full bg-emerald-600 flex-row items-center gap-1.5`}
          >
            <Ionicons name="book-outline" size={15} color="#fff" />
            <Text style={tw`text-white font-semibold text-footnote`}>Write a journal line</Text>
          </PressableScale>
        </>
      ) : (
        <>
          <View style={tw`flex-row flex-wrap gap-2 mt-3`}>
            {chips.map((c) => (
              <View key={c} style={tw`px-3 py-1.5 rounded-full bg-card/80 border border-line/70`}>
                <Text style={tw`text-xs font-semibold text-ink-2`}>{c}</Text>
              </View>
            ))}
          </View>
          {recap.reflection ? (
            <Text style={tw`text-body text-ink-2 mt-3 leading-5`}>{recap.reflection}</Text>
          ) : null}
          <PressableScale
            feedback={false}
            onPress={share}
            accessibilityRole="button"
            style={tw`mt-3 py-3 rounded-control bg-energy-600 items-center flex-row justify-center gap-2`}
          >
            <Ionicons name="share-social-outline" size={16} color="#fff" />
            <Text style={tw`text-white font-bold text-body`}>Share my week</Text>
          </PressableScale>
        </>
      )}

      <ShareCardSheet
        visible={!!sharePayload}
        payload={sharePayload}
        onClose={() => setSharePayload(null)}
      />
    </View>
  );
}

export default React.memo(WeeklyRecapCard);
