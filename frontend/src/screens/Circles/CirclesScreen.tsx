import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import PressableScale from '../../components/ui/PressableScale';
import FadeInUp from '../../components/ui/FadeInUp';
import EmptyState from '../../components/ui/EmptyState';
import LocationPickerSheet from '../../components/marketplace/LocationPickerSheet';
import SeatFill from '../../components/circles/SeatFill';
import {
  createGroup,
  joinGroup,
  listGroups,
  placeGroup,
  updateCirclePrefs,
  type CircleMatchMode,
  type CirclePrefs,
  type GrowthGroup,
  DEFAULT_CIRCLE_PREFS,
} from '../../services/api/groups';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { feedback } from '../../utils/interactionFeedback';
import { getCategoryLabel, getCategoryMeta } from '../../utils/categoryLabels';
import { useAppSelector } from '../../store/store';
import { alertMessage } from '../../utils/confirmDialog';
import { getAllCountriesSorted } from '../../data/geoLocations';

const MATCH_OPTIONS: {
  id: CircleMatchMode;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'mix', label: 'Mix', hint: 'Your paths first, then closer rooms if a city is set.', icon: 'color-filter-outline' },
  { id: 'nearby', label: 'Nearby', hint: 'Lean local. Needs a city or country below.', icon: 'location-outline' },
  { id: 'matching', label: 'Matching', hint: 'Only rooms on your growth paths.', icon: 'compass-outline' },
  { id: 'random', label: 'Random', hint: 'Shuffle open rooms that already have people.', icon: 'shuffle-outline' },
];

function vibeLabel(group: GrowthGroup) {
  if (group.is_full || group.vibe === 'full') return 'Full';
  if (group.member_count <= 1) return 'Just you';
  if (group.vibe === 'live' || group.member_count >= 4) return 'In session';
  return 'Warming up';
}

function placeLabel(group: GrowthGroup) {
  const city = group.city?.trim();
  const country = group.country?.trim();
  if (city && country) return `${city}, ${country}`;
  return city || country || null;
}

function matchesUserPath(pathKey: string, pathKeys: string[]) {
  if (!pathKey || pathKey === 'grove') return true;
  const key = pathKey.toLowerCase();
  return pathKeys.some((p) => {
    const k = p.toLowerCase();
    return k === key || k.startsWith(`${key}:`) || key.startsWith(`${k}:`) || k.split(':')[0] === key;
  });
}

function nearbyRank(group: GrowthGroup, prefs: CirclePrefs) {
  const cityA = (prefs.city || '').trim().toLowerCase();
  const cityB = (group.city || '').trim().toLowerCase();
  const countryA = (prefs.country || '').trim().toLowerCase();
  const countryB = (group.country || '').trim().toLowerCase();
  if (cityA && cityB && cityA === cityB) return 2;
  if (countryA && countryB && countryA === countryB) return 1;
  return 0;
}

function CircleCard({
  group,
  onOpen,
  onJoin,
  joining,
}: {
  group: GrowthGroup;
  onOpen: () => void;
  onJoin?: () => void;
  joining?: boolean;
}) {
  const meta = getCategoryMeta(group.path_key === 'grove' ? 'wellness' : group.path_key);
  const full = group.is_full || group.seats_left <= 0;
  const where = placeLabel(group);
  const vibe = vibeLabel(group);
  return (
    <View style={tw`mb-2.5 rounded-[22px] border border-stone-200/80 bg-[#FFFcf7] overflow-hidden`}>
      <View style={tw`h-1 ${full ? 'bg-[#F97066]' : 'bg-emerald-600'}`} />
      <View style={tw`px-3.5 py-3.5 flex-row items-center`}>
        <PressableScale onPress={onOpen} feedback="open" style={tw`flex-1`}>
          <View style={tw`flex-row items-center`}>
            <View style={tw`w-11 h-11 rounded-2xl bg-emerald-50 items-center justify-center mr-3`}>
              <Ionicons name={meta.icon} size={20} color="#059669" />
            </View>
            <View style={tw`flex-1`}>
              <View style={tw`flex-row items-center mb-0.5`}>
                <View
                  style={tw`px-1.5 py-0.5 rounded-full mr-1.5 ${
                    full ? 'bg-[#FFF1F0]' : group.member_count <= 1 ? 'bg-[#EAE4D6]' : 'bg-emerald-50'
                  }`}
                >
                  <Text
                    style={tw`text-[9px] font-bold uppercase ${
                      full ? 'text-[#E11D48]' : group.member_count <= 1 ? 'text-stone-600' : 'text-emerald-800'
                    }`}
                  >
                    {vibe}
                  </Text>
                </View>
                {where ? (
                  <Text style={tw`text-[11px] text-stone-400 flex-1`} numberOfLines={1}>
                    {where}
                  </Text>
                ) : null}
              </View>
              <Text style={tw`text-[15px] font-bold text-stone-900`} numberOfLines={1}>
                {group.name}
              </Text>
            </View>
          </View>
          <View style={tw`mt-2.5 ml-[56px]`}>
            <SeatFill filled={group.member_count} max={group.max_members || 10} />
          </View>
        </PressableScale>
        {group.joined ? (
          <PressableScale onPress={onOpen} feedback="open" style={tw`ml-2`}>
            <Ionicons name="chevron-forward" size={16} color="#A8A29E" />
          </PressableScale>
        ) : onJoin && !full ? (
          <PressableScale
            onPress={onJoin}
            disabled={joining}
            feedback="success"
            style={tw`ml-2 px-3 py-2 rounded-xl bg-emerald-600 ${joining ? 'opacity-60' : ''}`}
          >
            <Text style={tw`text-white text-xs font-bold`}>Sit</Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

export default function CirclesScreen() {
  const navigation = useNavigation();
  const user = useAppSelector((s) => s.auth.user);
  const [mine, setMine] = useState<GrowthGroup[]>([]);
  const [templates, setTemplates] = useState<GrowthGroup[]>([]);
  const [suggested, setSuggested] = useState<GrowthGroup[]>([]);
  const [prefs, setPrefs] = useState<CirclePrefs>(DEFAULT_CIRCLE_PREFS);
  const [pathFilter, setPathFilter] = useState<string>('all');
  const [cityDraft, setCityDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [placingKey, setPlacingKey] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [pathKey, setPathKey] = useState('');
  const [saving, setSaving] = useState(false);

  const countries = useMemo(() => getAllCountriesSorted(), []);
  const countryOptions = useMemo(
    () => countries.map((c) => ({ key: c.isoCode, label: `${c.flag} ${c.name}` })),
    [countries]
  );

  const pathOptions = useMemo(() => {
    const cats = user?.categories || [];
    const keys = new Set<string>(['grove']);
    cats.forEach((c) => {
      keys.add(c.includes(':') ? c.split(':')[0] : c);
      keys.add(c);
    });
    return [...keys];
  }, [user?.categories]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await listGroups();
      setMine(res.mine);
      setTemplates(res.templates);
      setSuggested(res.suggested.filter((g) => !g.joined && g.member_count > 0 && !g.is_full));
      setPrefs(res.prefs);
      setCityDraft(res.prefs.city || '');
    } catch {
      setMine([]);
      setTemplates([]);
      setSuggested([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const savePrefs = async (next: Partial<CirclePrefs>) => {
    try {
      const saved = await updateCirclePrefs(next);
      setPrefs(saved);
      if (next.city !== undefined) setCityDraft(saved.city || '');
      feedback.select();
      await load(true);
    } catch (e) {
      feedback.error();
      alertMessage('Could not save', e instanceof Error ? e.message : 'Try again');
    }
  };

  const onJoin = async (id: string) => {
    setJoiningId(id);
    try {
      const res = await joinGroup(id);
      feedback.success();
      if (res.placed && res.group?.id && res.group.id !== id) {
        navigateFromRoot(navigation, 'CircleDetail', { groupId: res.group.id });
        return;
      }
      await load(true);
    } catch (e) {
      feedback.error();
      alertMessage('Could not join', e instanceof Error ? e.message : 'Try again');
    } finally {
      setJoiningId(null);
    }
  };

  const onPlace = async (key: string) => {
    setPlacingKey(key);
    try {
      const res = await placeGroup(key);
      feedback.success();
      navigateFromRoot(navigation, 'CircleDetail', { groupId: res.group.id });
    } catch (e) {
      feedback.error();
      alertMessage('Could not find a circle', e instanceof Error ? e.message : 'Try again');
    } finally {
      setPlacingKey(null);
    }
  };

  const onCreate = async () => {
    if (!name.trim() || !pathKey) {
      alertMessage('Name and path', 'Give the circle a name and pick a path.');
      return;
    }
    setSaving(true);
    try {
      const group = await createGroup({
        name: name.trim(),
        path_key: pathKey,
        description: desc.trim() || undefined,
      });
      feedback.success();
      setCreateOpen(false);
      setName('');
      setDesc('');
      navigateFromRoot(navigation, 'CircleDetail', { groupId: group.id });
    } catch (e) {
      feedback.error();
      alertMessage('Could not create', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSaving(false);
    }
  };

  const open = (id: string) => navigateFromRoot(navigation, 'CircleDetail', { groupId: id });
  const selectedMatch = MATCH_OPTIONS.find((o) => o.id === prefs.match) || MATCH_OPTIONS[0];
  const hasPlace = Boolean(prefs.city || prefs.country);

  const pathChips = useMemo(() => {
    const keys = new Set<string>(['all', ...pathOptions]);
    mine.forEach((g) => keys.add(g.path_key));
    suggested.forEach((g) => keys.add(g.path_key));
    return [...keys];
  }, [pathOptions, mine, suggested]);

  const filteredMine = useMemo(() => {
    if (pathFilter === 'all') return mine;
    return mine.filter((g) => g.path_key === pathFilter);
  }, [mine, pathFilter]);

  const findable = useMemo(() => {
    let list = templates.filter(
      (g) => !g.already_in && matchesUserPath(g.path_key, pathOptions)
    );
    if (pathFilter !== 'all') list = list.filter((g) => g.path_key === pathFilter);
    if (prefs.match === 'matching') {
      list = list.filter((g) => matchesUserPath(g.path_key, pathOptions));
    }
    if (prefs.match === 'random') {
      list = [...list].sort((a, b) => a.id.localeCompare(b.id));
    }
    return list;
  }, [templates, pathOptions, pathFilter, prefs.match]);

  const openSeats = useMemo(() => {
    let list = suggested.filter((g) => matchesUserPath(g.path_key, pathOptions));
    if (pathFilter !== 'all') list = list.filter((g) => g.path_key === pathFilter);
    if (prefs.match === 'matching') {
      list = list.filter((g) => matchesUserPath(g.path_key, pathOptions));
    }
    if (prefs.match === 'nearby' && hasPlace) {
      const local = list.filter((g) => nearbyRank(g, prefs) > 0);
      list = local.length
        ? local.sort((a, b) => nearbyRank(b, prefs) - nearbyRank(a, prefs))
        : [];
    }
    if (prefs.match === 'mix') {
      list = [...list].sort((a, b) => {
        const sa = (matchesUserPath(a.path_key, pathOptions) ? 2 : 0) + nearbyRank(a, prefs);
        const sb = (matchesUserPath(b.path_key, pathOptions) ? 2 : 0) + nearbyRank(b, prefs);
        return sb - sa || b.member_count - a.member_count;
      });
    }
    if (prefs.match === 'random') {
      list = [...list].sort((a, b) => (a.id.charCodeAt(4) % 7) - (b.id.charCodeAt(4) % 7));
    }
    return list;
  }, [suggested, pathOptions, pathFilter, prefs, hasPlace]);

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <PressableScale
            onPress={() => navigation.goBack()}
            feedback="close"
            style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
          >
            <Ionicons name="arrow-back" size={18} color="#1C1917" />
          </PressableScale>
        }
        right={
          <PressableScale
            onPress={() => {
              setPathKey(pathOptions[0] || 'grove');
              setCreateOpen(true);
            }}
            feedback="open"
            style={tw`px-3 py-2 rounded-full bg-emerald-600`}
          >
            <Text style={tw`text-white text-xs font-bold`}>New circle</Text>
          </PressableScale>
        }
      />

      {loading ? (
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator color="#059669" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={tw`px-5 pb-28`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
              tintColor="#059669"
            />
          }
        >
          <FadeInUp>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
              Circles
            </Text>
            <Text style={tw`text-[28px] font-bold text-stone-900 mt-0.5 leading-8`}>Grow together</Text>
            <Text style={tw`text-sm text-stone-500 mt-1.5 leading-5 mb-5`}>
              Filters change what you see. Each room is one table of 10 — not a row of other circles.
            </Text>
          </FadeInUp>

          <View style={tw`rounded-[22px] border border-stone-200/80 bg-[#FFFcf7] overflow-hidden mb-4`}>
            <View style={tw`h-1 bg-emerald-600`} />
            <View style={tw`px-3.5 pt-3.5 pb-4`}>
              <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                Seat by
              </Text>
              <Text style={tw`text-xs text-stone-500 mt-1 mb-3`}>{selectedMatch.hint}</Text>
              <View style={tw`flex-row flex-wrap justify-between`}>
                {MATCH_OPTIONS.map((opt) => {
                  const on = prefs.match === opt.id;
                  return (
                    <PressableScale
                      key={opt.id}
                      onPress={() => {
                        setPrefs((p) => ({ ...p, match: opt.id }));
                        void savePrefs({ match: opt.id });
                      }}
                      feedback="select"
                      style={tw`w-[48%] mb-2 px-3 py-3 rounded-2xl border ${
                        on ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-stone-200'
                      }`}
                    >
                      <Ionicons name={opt.icon} size={16} color={on ? '#ECFDF5' : '#059669'} />
                      <Text style={tw`text-xs font-bold mt-1.5 ${on ? 'text-white' : 'text-stone-800'}`}>
                        {opt.label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>

              <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mt-1`}>
                Place — for Nearby and Mix
              </Text>
              {prefs.match === 'nearby' && !hasPlace ? (
                <Text style={tw`text-xs text-[#E11D48] mt-1 mb-3`}>
                  Add a country or city so Nearby can actually filter.
                </Text>
              ) : (
                <Text style={tw`text-xs text-stone-500 mt-1 mb-3`}>
                  Optional. Matching ignores this. Nearby uses it as a hard lean.
                </Text>
              )}
              <View style={tw`flex-row gap-2`}>
                <PressableScale
                  onPress={() => setCountryOpen(true)}
                  feedback="select"
                  style={tw`flex-1 bg-white border border-stone-200 rounded-2xl px-3 py-3.5`}
                >
                  <Text style={tw`text-[10px] font-bold text-stone-400 uppercase`}>Country</Text>
                  <Text
                    style={tw`text-sm font-semibold mt-0.5 ${
                      prefs.country ? 'text-stone-900' : 'text-stone-400'
                    }`}
                    numberOfLines={1}
                  >
                    {prefs.country || 'Anywhere'}
                  </Text>
                </PressableScale>
                <View style={tw`flex-1 bg-white border border-stone-200 rounded-2xl px-3 py-2.5`}>
                  <Text style={tw`text-[10px] font-bold text-stone-400 uppercase`}>City</Text>
                  <TextInput
                    value={cityDraft}
                    onChangeText={setCityDraft}
                    onEndEditing={() => {
                      const next = cityDraft.trim();
                      if (next === (prefs.city || '')) return;
                      void savePrefs({ city: next || null });
                    }}
                    placeholder="Optional"
                    placeholderTextColor="#A8A29E"
                    style={tw`text-sm font-semibold text-stone-900 py-0.5`}
                  />
                </View>
              </View>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-5`}>
            {pathChips.map((k) => {
              const on = pathFilter === k;
              return (
                <PressableScale
                  key={k}
                  onPress={() => {
                    feedback.select();
                    setPathFilter(k);
                  }}
                  feedback="select"
                  style={tw`mr-2 px-3 py-2 rounded-full border ${
                    on ? 'bg-stone-900 border-stone-900' : 'bg-white border-stone-200'
                  }`}
                >
                  <Text style={tw`text-xs font-bold ${on ? 'text-white' : 'text-stone-700'}`}>
                    {k === 'all' ? 'All paths' : k === 'grove' ? 'Grove' : getCategoryLabel(k)}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>

          <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
            Yours
          </Text>
          {filteredMine.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title={mine.length === 0 ? 'No circles yet' : 'Nothing on this path'}
              description={
                mine.length === 0
                  ? 'Find a room on one of your paths, or start one of your own.'
                  : 'Clear the path chip or pick another filter.'
              }
            />
          ) : (
            filteredMine.map((g, i) => (
              <FadeInUp key={g.id} delay={i * 40}>
                <CircleCard group={g} onOpen={() => open(g.id)} />
              </FadeInUp>
            ))
          )}

          {findable.length > 0 ? (
            <>
              <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-3 mt-5`}>
                Find on your paths
              </Text>
              {findable.map((g) => (
                <FadeInUp key={g.id}>
                  <View
                    style={tw`mb-2.5 rounded-[22px] border border-stone-200/80 bg-[#FFFcf7] overflow-hidden`}
                  >
                    <View style={tw`h-1 bg-emerald-600`} />
                    <View style={tw`px-3.5 py-3.5 flex-row items-center`}>
                      <View style={tw`flex-1 pr-3`}>
                        <Text style={tw`text-[15px] font-bold text-stone-900`} numberOfLines={1}>
                          {g.path_key === 'grove' ? 'The Grove' : getCategoryLabel(g.path_key)}
                        </Text>
                        <Text style={tw`text-xs text-stone-500 mt-0.5 leading-4`} numberOfLines={2}>
                          You’re not in this path yet. We’ll sit you in a live room, or open the first table.
                        </Text>
                      </View>
                      <PressableScale
                        onPress={() => void onPlace(g.path_key)}
                        disabled={placingKey === g.path_key}
                        feedback="success"
                        style={tw`px-3 py-2 rounded-xl bg-emerald-600 ${
                          placingKey === g.path_key ? 'opacity-60' : ''
                        }`}
                      >
                        <Text style={tw`text-white text-xs font-bold`}>
                          {placingKey === g.path_key ? 'Finding…' : 'Find'}
                        </Text>
                      </PressableScale>
                    </View>
                  </View>
                </FadeInUp>
              ))}
            </>
          ) : null}

          <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-3 mt-5`}>
            Open seats
          </Text>
          {openSeats.length === 0 ? (
            <Text style={tw`text-sm text-stone-500 leading-5 mb-2`}>
              {prefs.match === 'nearby' && !hasPlace
                ? 'Nearby needs a place first — or switch to Mix / Matching.'
                : prefs.match === 'nearby'
                  ? 'No open room matches that place yet. Mix will still fill a lively path room.'
                  : 'No other open rooms on this filter. That’s expected if Grove is your only circle.'}
            </Text>
          ) : (
            openSeats.map((g) => (
              <CircleCard
                key={g.id}
                group={g}
                onOpen={() => open(g.id)}
                onJoin={() => void onJoin(g.id)}
                joining={joiningId === g.id}
              />
            ))
          )}
        </ScrollView>
      )}

      <LocationPickerSheet
        visible={countryOpen}
        title="Country"
        placeholder="Search countries"
        options={[{ key: '', label: 'Anywhere' }, ...countryOptions]}
        selectedKey={
          countries.find((c) => c.name === prefs.country)?.isoCode || (prefs.country ? undefined : '')
        }
        onClose={() => setCountryOpen(false)}
        onSelect={(option) => {
          setCountryOpen(false);
          if (!option.key) {
            void savePrefs({ country: null });
            return;
          }
          const country = countries.find((c) => c.isoCode === option.key);
          void savePrefs({ country: country?.name || option.label.replace(/^\S+\s/, '') });
        }}
      />

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={tw`flex-1 justify-end bg-black/40`}
        >
          <View style={tw`bg-[#F3EEE4] rounded-t-[28px] px-5 pt-4 pb-10`}>
            <View style={tw`w-10 h-1 rounded-full bg-stone-300 self-center mb-4`} />
            <Text style={tw`text-lg font-bold text-stone-900`}>Start a circle</Text>
            <Text style={tw`text-sm text-stone-500 mt-1 mb-4`}>
              Ten chairs on one of your paths. If the last person stands up, we put the chairs away.
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Circle name"
              placeholderTextColor="#A8A29E"
              style={tw`bg-white border border-stone-200 rounded-2xl px-4 py-3.5 text-stone-900 mb-3`}
            />
            <TextInput
              value={desc}
              onChangeText={setDesc}
              placeholder="What do you practice here?"
              placeholderTextColor="#A8A29E"
              multiline
              style={tw`bg-white border border-stone-200 rounded-2xl px-4 py-3.5 text-stone-900 mb-3 min-h-[72px]`}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-4`}>
              {pathOptions.map((k) => (
                <PressableScale
                  key={k}
                  onPress={() => setPathKey(k)}
                  feedback="select"
                  style={tw`mr-2 px-3 py-2 rounded-full border ${
                    pathKey === k
                      ? 'bg-emerald-600 border-emerald-600'
                      : 'bg-white border-stone-200'
                  }`}
                >
                  <Text
                    style={tw`text-xs font-bold ${pathKey === k ? 'text-white' : 'text-stone-700'}`}
                  >
                    {k === 'grove' ? 'The Grove' : getCategoryLabel(k)}
                  </Text>
                </PressableScale>
              ))}
            </ScrollView>
            <View style={tw`flex-row gap-2`}>
              <PressableScale
                onPress={() => setCreateOpen(false)}
                feedback="close"
                style={tw`flex-1 py-3.5 rounded-2xl bg-white border border-stone-200 items-center`}
              >
                <Text style={tw`font-semibold text-stone-700`}>Cancel</Text>
              </PressableScale>
              <PressableScale
                onPress={() => void onCreate()}
                disabled={saving}
                feedback="success"
                style={tw`flex-1 py-3.5 rounded-2xl bg-emerald-600 items-center ${saving ? 'opacity-60' : ''}`}
              >
                <Text style={tw`font-bold text-white`}>{saving ? 'Creating…' : 'Create'}</Text>
              </PressableScale>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
