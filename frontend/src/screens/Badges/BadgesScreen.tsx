import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import ScreenHeader from '../../components/ui/ScreenHeader';
import PressableScale from '../../components/ui/PressableScale';
import AnimatedBottomSheet from '../../components/ui/AnimatedBottomSheet';
import FadeInUp from '../../components/ui/FadeInUp';
import ShareCardSheet, { type ShareCardPayload } from '../../components/share/ShareCardSheet';
import BadgeIcon from '../../components/badges/BadgeIcon';
import LevelProgressCard from '../../components/badges/LevelProgressCard';
import {
  BADGE_CATEGORY_LABELS,
  BADGE_CATEGORY_ORDER,
  formatEarnedDate,
  progressFraction,
} from '../../components/badges/badgeMeta';
import { badgeSharePayload } from '../../components/badges/shareAdapters';
import { getMyBadges, type BadgeCatalogItem, type MyBadges } from '../../services/api/growth';
import { useAuth } from '../../store/hooks';

type Tile = BadgeCatalogItem & { earnedAt: string | null };

/** All badges grouped by category, with progress for locked ones and dates for earned ones. */
export default function BadgesScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<MyBadges | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Tile | null>(null);
  const [sharePayload, setSharePayload] = useState<ShareCardPayload | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getMyBadges();
      setData(res);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tiles = useMemo(() => {
    if (!data) return [] as Tile[];
    const earnedAt = new Map(data.earned.map((e) => [e.id, e.earned_at]));
    return data.catalog.map((c) => ({ ...c, earnedAt: earnedAt.get(c.id) ?? null }));
  }, [data]);

  const earnedCount = tiles.filter((t) => t.earnedAt).length;
  const columns = width >= 600 ? 4 : 3;
  const tileWidth = Math.floor((Math.min(width, 720) - 32 - (columns - 1) * 10) / columns);

  const shareTile = (t: Tile) => {
    setSelected(null);
    setSharePayload(
      badgeSharePayload({
        badgeId: t.id,
        name: t.name,
        description: t.description,
        points: t.points,
        earnedAt: t.earnedAt,
        username: user?.username || 'me',
        userId: user?.id,
        avatar: user?.avatar ?? null,
        levelName: data?.level.name,
      })
    );
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <ScreenHeader title="Badges" onBack={() => navigation.goBack()} backIcon="arrow-back" />
      {loading ? (
        <ActivityIndicator color="#059669" style={tw`mt-16`} />
      ) : failed && !data ? (
        <View style={tw`items-center px-8 mt-16`}>
          <Text style={tw`text-4xl`}>🌱</Text>
          <Text style={tw`text-base font-semibold text-stone-800 mt-3 text-center`}>
            Your badges are still sprouting
          </Text>
          <Text style={tw`text-sm text-stone-500 mt-1 text-center`}>
            We couldn’t load them just now.
          </Text>
          <PressableScale
            onPress={() => {
              setLoading(true);
              void load();
            }}
            feedback="refresh"
            style={tw`mt-4 px-5 py-2.5 rounded-full bg-[#EAE4D6] border border-stone-200`}
          >
            <Text style={tw`text-sm font-semibold text-emerald-700`}>Try again</Text>
          </PressableScale>
        </View>
      ) : data ? (
        <ScrollView
          contentContainerStyle={tw`px-4 pb-16 pt-2`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor="#059669"
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
        >
          <FadeInUp>
            <LevelProgressCard level={data.level} />
            <Text style={tw`text-xs text-stone-500 mt-2 mb-1 px-1`}>
              {earnedCount} of {tiles.length} badges earned · points can’t be spent, they just show
              how far you’ve grown.
            </Text>
          </FadeInUp>

          {BADGE_CATEGORY_ORDER.map((cat) => {
            const items = tiles.filter((t) => t.category === cat);
            if (!items.length) return null;
            return (
              <View key={cat} style={tw`mt-5`}>
                <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2.5 px-1`}>
                  {BADGE_CATEGORY_LABELS[cat]}
                </Text>
                <View style={tw`flex-row flex-wrap gap-2.5`}>
                  {items.map((t) => (
                    <BadgeTile key={t.id} tile={t} width={tileWidth} onPress={() => setSelected(t)} />
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      <AnimatedBottomSheet visible={!!selected} onClose={() => setSelected(null)} maxHeightRatio={0.6}>
        {selected ? (
          <View style={tw`items-center px-6 pt-2 pb-8`}>
            <BadgeIcon id={selected.id} size={96} tier={selected.tier} locked={!selected.earnedAt} />
            <Text style={tw`text-xl font-bold text-stone-900 mt-3 text-center`}>{selected.name}</Text>
            <Text style={tw`text-sm text-stone-600 mt-1 text-center leading-5`}>{selected.description}</Text>
            <Text style={tw`text-xs font-semibold text-[#E85D55] mt-2`}>
              +{selected.points} growth points{selected.tier === 'rare' ? ' · rare' : ''}
            </Text>
            {selected.earnedAt ? (
              <>
                <Text style={tw`text-xs text-stone-500 mt-2`}>
                  Earned {formatEarnedDate(selected.earnedAt)}
                </Text>
                <PressableScale
                  onPress={() => shareTile(selected)}
                  feedback="open"
                  style={tw`mt-5 self-stretch py-3 rounded-2xl bg-emerald-600 items-center`}
                >
                  <Text style={tw`text-white font-bold`}>Share this badge</Text>
                </PressableScale>
              </>
            ) : (
              <View style={tw`self-stretch mt-4`}>
                <ProgressLine p={selected.progress} />
                <Text style={tw`text-xs text-stone-500 mt-2 text-center`}>
                  Not yet — and that’s fine. Every small step counts.
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </AnimatedBottomSheet>

      <ShareCardSheet visible={!!sharePayload} payload={sharePayload} onClose={() => setSharePayload(null)} />
    </SafeAreaView>
  );
}

function ProgressLine({ p }: { p: { current: number; target: number } }) {
  const frac = progressFraction(p);
  return (
    <View>
      <View style={tw`h-1.5 bg-[#EAE4D6] rounded-full overflow-hidden`}>
        <View style={[tw`h-full rounded-full bg-[#F97066]`, { width: `${Math.max(frac > 0 ? 6 : 0, frac * 100)}%` }]} />
      </View>
      <Text style={tw`text-[10px] text-stone-500 mt-1 text-center`}>
        {Math.min(p.current, p.target)}/{p.target}
      </Text>
    </View>
  );
}

function BadgeTile({ tile, width, onPress }: { tile: Tile; width: number; onPress: () => void }) {
  const earned = !!tile.earnedAt;
  return (
    <PressableScale
      onPress={onPress}
      feedback="tap"
      style={[
        tw`items-center rounded-2xl px-2 pt-3 pb-2.5 border ${
          earned ? 'bg-[#FFFcf7] border-stone-200/80' : 'bg-[#F7F3EA] border-stone-200/50'
        }`,
        { width },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${tile.name}. ${
        earned ? `Earned ${formatEarnedDate(tile.earnedAt)}` : `${tile.progress.current} of ${tile.progress.target}`
      }`}
    >
      <BadgeIcon id={tile.id} size={56} tier={tile.tier} locked={!earned} />
      <Text
        style={tw`text-xs font-semibold mt-2 text-center ${earned ? 'text-stone-900' : 'text-stone-500'}`}
        numberOfLines={1}
      >
        {tile.name}
      </Text>
      {earned ? (
        <Text style={tw`text-[10px] text-emerald-700 mt-0.5`} numberOfLines={1}>
          {formatEarnedDate(tile.earnedAt)}
        </Text>
      ) : (
        <View style={tw`self-stretch mt-1.5 px-1`}>
          <ProgressLine p={tile.progress} />
        </View>
      )}
    </PressableScale>
  );
}
