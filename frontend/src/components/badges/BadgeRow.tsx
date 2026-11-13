import React, { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import BadgeIcon from './BadgeIcon';
import {
  RARE_BADGE_IDS,
  badgeName,
  pickLockedPreview,
  progressFraction,
  sortEarnedNewestFirst,
} from './badgeMeta';
import type { BadgeCatalogItem, MyBadges } from '../../services/api/growth';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';

type Props = {
  earned: { id: string; earned_at: string }[];
  /** Own profile only: locked silhouettes + "Next" bar come from the catalog. */
  catalog?: BadgeCatalogItem[];
  next?: MyBadges['next'];
  /** Show up to 3 locked "next" silhouettes (default true when a catalog is passed). */
  showLocked?: boolean;
  /** Override tap (default: navigate to the Badges screen). Pass null to disable. */
  onPress?: (() => void) | null;
  title?: string;
};

/**
 * Horizontal strip of earned badges + a few locked "next" silhouettes and a
 * progress bar toward the next one. Tap → Badges screen.
 */
export default function BadgeRow({
  earned,
  catalog,
  next,
  showLocked,
  onPress,
  title = 'Badges',
}: Props) {
  const navigation = useNavigation<any>();
  const withLocked = showLocked ?? !!catalog;

  const sortedEarned = useMemo(() => sortEarnedNewestFirst(earned), [earned]);
  const tierById = useMemo(() => {
    const m = new Map<string, BadgeCatalogItem['tier']>();
    for (const c of catalog || []) m.set(c.id, c.tier);
    return m;
  }, [catalog]);
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of catalog || []) m.set(c.id, c.name);
    return m;
  }, [catalog]);
  const locked = useMemo(() => {
    if (!withLocked || !catalog) return [];
    return pickLockedPreview(catalog, new Set(earned.map((e) => e.id)), next?.id, 3);
  }, [withLocked, catalog, earned, next?.id]);

  if (sortedEarned.length === 0 && locked.length === 0) return null;

  const tierOf = (id: string) => tierById.get(id) ?? (RARE_BADGE_IDS.has(id) ? 'rare' : 'common');
  const nameOf = (id: string) => nameById.get(id) ?? badgeName(id);
  const handlePress =
    onPress === null
      ? undefined
      : onPress ?? (() => navigateFromRoot(navigation, 'Badges'));

  const nextFrac = next ? progressFraction(next.progress) : 0;

  return (
    <PressableScale
      onPress={handlePress}
      disabled={!handlePress}
      feedback="open"
      pressedScale={0.99}
      style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-2xl pt-3.5 pb-3`}
      accessibilityRole={handlePress ? 'button' : undefined}
      accessibilityLabel={`${title}: ${sortedEarned.length} earned${handlePress ? '. Open all badges' : ''}`}
    >
      <View style={tw`flex-row items-center justify-between px-4 mb-2.5`}>
        <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
          {title}
          {sortedEarned.length > 0 ? ` · ${sortedEarned.length}` : ''}
        </Text>
        {handlePress ? (
          <View style={tw`flex-row items-center`}>
            <Text style={tw`text-xs font-semibold text-emerald-700 mr-0.5`}>See all</Text>
            <Ionicons name="chevron-forward" size={14} color="#047857" />
          </View>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={tw`px-4 gap-3`}
      >
        {sortedEarned.map((b) => (
          <View key={b.id} style={tw`items-center w-16`}>
            <BadgeIcon id={b.id} size={52} tier={tierOf(b.id)} />
            <Text style={tw`text-[11px] text-stone-700 font-semibold mt-1 text-center`} numberOfLines={1}>
              {nameOf(b.id)}
            </Text>
          </View>
        ))}
        {locked.map((b) => (
          <View key={b.id} style={tw`items-center w-16`}>
            <BadgeIcon id={b.id} size={52} locked />
            <Text style={tw`text-[11px] text-stone-500 mt-1 text-center`} numberOfLines={1}>
              {b.name}
            </Text>
          </View>
        ))}
      </ScrollView>

      {withLocked && next ? (
        <View style={tw`px-4 mt-3`}>
          <View style={tw`flex-row items-center justify-between mb-1`}>
            <Text style={tw`text-xs text-stone-600`} numberOfLines={1}>
              Next: <Text style={tw`font-semibold text-stone-800`}>{next.name}</Text>
            </Text>
            <Text style={tw`text-xs text-stone-500`}>
              {Math.min(next.progress.current, next.progress.target)}/{next.progress.target}
            </Text>
          </View>
          <View style={tw`h-1.5 bg-[#EAE4D6] rounded-full overflow-hidden`}>
            <View
              style={[tw`h-full rounded-full bg-[#F97066]`, { width: `${Math.max(4, nextFrac * 100)}%` }]}
            />
          </View>
        </View>
      ) : null}
    </PressableScale>
  );
}
