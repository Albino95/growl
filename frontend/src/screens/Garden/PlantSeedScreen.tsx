import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import PressableScale from '../../components/ui/PressableScale';
import FadeInUp from '../../components/ui/FadeInUp';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import CATEGORIES, { type Category } from '../../data/categories';
import { createSeed } from '../../services/api/seeds';
import { feedback } from '../../utils/interactionFeedback';
import { alertMessage } from '../../utils/confirmDialog';
import SeedPlantVisual from '../../components/garden/SeedPlantVisual';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { useAppSelector } from '../../store/store';
import {
  fallbackGoalSchema,
  goalSchemaFor,
  type SeedGoalSchema,
} from '../../components/garden/seedGoalMeta';

type PathOption = {
  parent: Category;
  /** null = parent means all focuses */
  allowedSubKeys: string[] | null;
};

function buildPathOptions(userCats: string[]): PathOption[] {
  const byParent = new Map<string, Set<string> | 'all'>();
  for (const raw of userCats) {
    const c = String(raw || '').trim();
    if (!c) continue;
    if (!c.includes(':')) {
      byParent.set(c, 'all');
      continue;
    }
    const [parent, sub] = c.split(':');
    const existing = byParent.get(parent);
    if (existing === 'all') continue;
    if (!existing) byParent.set(parent, new Set([sub]));
    else existing.add(sub);
  }

  const options: PathOption[] = [];
  for (const cat of CATEGORIES) {
    const entry = byParent.get(cat.key);
    if (!entry) continue;
    options.push({
      parent: cat,
      allowedSubKeys: entry === 'all' ? null : [...entry],
    });
  }
  return options;
}

/** Stable empty list so the selector doesn't return a new array each time. */
const NO_CATEGORIES: string[] = [];

/**
 * Plant a seed — only from the user’s growth paths, with goal metrics.
 */
export default function PlantSeedScreen() {
  const navigation = useNavigation();
  const userCats = useAppSelector((s) => s.auth.user?.categories ?? NO_CATEGORIES);
  const pathOptions = useMemo(() => buildPathOptions(userCats), [userCats]);

  const [parentKey, setParentKey] = useState<string | null>(null);
  const [subKey, setSubKey] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [startText, setStartText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [busy, setBusy] = useState(false);
  const [planted, setPlanted] = useState(false);
  const celebrate = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();

  const pathOpt = pathOptions.find((p) => p.parent.key === parentKey) || null;
  const subs = useMemo(() => {
    if (!pathOpt) return [];
    if (!pathOpt.allowedSubKeys) return pathOpt.parent.subcategories;
    return pathOpt.parent.subcategories.filter((s) =>
      pathOpt.allowedSubKeys!.includes(s.key)
    );
  }, [pathOpt]);

  const schema: SeedGoalSchema | null = subKey
    ? goalSchemaFor(subKey) || fallbackGoalSchema()
    : null;

  const onPlant = async () => {
    if (!parentKey || !subKey || busy) return;
    if (!schema) return;

    const metric_start = Number(startText.trim());
    const metric_target = Number(targetText.trim());
    if (!Number.isFinite(metric_start) || !Number.isFinite(metric_target)) {
      alertMessage('Set your numbers', `${schema.startLabel} and ${schema.targetLabel} are required.`);
      return;
    }
    if (metric_start === metric_target) {
      alertMessage('Different numbers', 'Start and goal need to be different.');
      return;
    }

    setBusy(true);
    try {
      const seed = await createSeed({
        category_key: parentKey,
        subcategory_key: subKey,
        title: title.trim() || undefined,
        goal_detail: detail.trim() || undefined,
        metric_type: schema.kind,
        metric_unit: schema.unit,
        metric_start,
        metric_target,
      });
      feedback.success();
      setPlanted(true);
      if (reduceMotion) {
        // Full size at once; just a soft fade.
        celebrate.setValue(1);
        Animated.timing(glow, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      } else Animated.parallel([
        Animated.spring(celebrate, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]).start();
      setTimeout(() => {
        navigation.goBack();
        navigateFromRoot(navigation, 'SeedDetail', { seedId: seed.id });
      }, 1200);
    } catch (e) {
      feedback.error();
      alertMessage('Could not plant', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  if (planted) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        <View style={tw`flex-1 items-center justify-center px-8`}>
          <Animated.View
            style={{
              opacity: glow,
              transform: [
                {
                  scale: celebrate.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.55, 1],
                  }),
                },
              ],
            }}
          >
            <View
              style={{
                shadowColor: '#059669',
                shadowOpacity: 0.35,
                shadowRadius: 28,
                shadowOffset: { width: 0, height: 8 },
              }}
            >
              <SeedPlantVisual stage="seed" progress={0.08} size={128} pulseKey={1} />
            </View>
          </Animated.View>
          <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase mt-12`}>
            Grow!
          </Text>
          <Text style={tw`text-2xl font-bold text-ink mt-1 text-center`}>
            You planted a seed
          </Text>
          <Text style={tw`text-sm text-ink-3 mt-2 text-center leading-5`}>
            Check in with numbers and photo evidence — watch it grow into your Garden.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (pathOptions.length === 0) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        <GrowChromeHeader
          leftAccessory={
            <PressableScale
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => navigation.goBack()}
              feedback="close"
              style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
            >
              <Ionicons name="close" size={18} color={theme.colors.ink} />
            </PressableScale>
          }
        />
        <View style={tw`flex-1 px-6 justify-center items-center`}>
          <View style={tw`w-16 h-16 rounded-card bg-emerald-50 items-center justify-center mb-4`}>
            <Ionicons name="trail-sign-outline" size={28} color={theme.colors.brand} />
          </View>
          <Text style={tw`text-xl font-bold text-ink text-center`}>Pick growth paths first</Text>
          <Text style={tw`text-sm text-ink-3 mt-2 text-center leading-5`}>
            Seeds only grow on paths you’ve chosen. Update Paths on your profile, then come plant.
          </Text>
          <PressableScale
            onPress={() => {
              navigation.goBack();
              navigateFromRoot(navigation, 'EditProfile');
            }}
            feedback="open"
            style={tw`mt-6 px-6 py-3.5 rounded-card bg-emerald-600`}
          >
            <Text style={tw`text-white font-bold`}>Open profile paths</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <PressableScale
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => navigation.goBack()}
            feedback="close"
            style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
          >
            <Ionicons name="close" size={18} color={theme.colors.ink} />
          </PressableScale>
        }
      />
      <KeyboardAvoidingView
        style={tw`flex-1`}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={tw`px-gutter-wide pb-32`} keyboardShouldPersistTaps="handled">
          <FadeInUp>
            <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase`}>
              Plant a seed
            </Text>
            <Text style={tw`text-display font-bold text-ink mt-0.5 leading-8`}>
              From your paths
            </Text>
            <Text style={tw`text-sm text-ink-3 mt-1.5 leading-5 mb-5`}>
              Only goals on your growth paths — with real numbers you’ll prove at check-in.
            </Text>
          </FadeInUp>

          <Text style={tw`text-xs font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
            Your path
          </Text>
          <View style={tw`flex-row flex-wrap gap-2 mb-5`}>
            {pathOptions.map(({ parent }) => {
              const active = parentKey === parent.key;
              return (
                <PressableScale
                  key={parent.key}
                  feedback="select"
                  onPress={() => {
                    setParentKey(parent.key);
                    setSubKey(null);
                    setStartText('');
                    setTargetText('');
                  }}
                  style={tw`px-3.5 py-2.5 rounded-card border flex-row items-center ${
                    active
                      ? 'bg-emerald-600 border-emerald-600'
                      : 'bg-card border-line'
                  }`}
                >
                  <Ionicons
                    name={(parent.icon || 'leaf-outline') as keyof typeof Ionicons.glyphMap}
                    size={14}
                    color={active ? '#fff' : theme.colors.brand}
                    style={tw`mr-1.5`}
                  />
                  <Text
                    style={tw`text-sm font-semibold ${active ? 'text-white' : 'text-ink-2'}`}
                  >
                    {parent.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {pathOpt ? (
            <FadeInUp key={pathOpt.parent.key}>
              <Text style={tw`text-xs font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
                Goal
              </Text>
              <View style={tw`flex-row flex-wrap gap-2 mb-5`}>
                {subs.map((s) => {
                  const active = subKey === s.key;
                  return (
                    <PressableScale
                      key={s.key}
                      feedback="select"
                      onPress={() => {
                        setSubKey(s.key);
                        if (!title.trim()) setTitle(s.label);
                        setStartText('');
                        setTargetText('');
                      }}
                      style={tw`px-3.5 py-2 rounded-full border ${
                        active
                          ? 'bg-ink border-ink'
                          : 'bg-raised border-line'
                      }`}
                    >
                      <Text
                        style={tw`text-sm font-semibold ${
                          active ? 'text-page' : 'text-ink-2'
                        }`}
                      >
                        {s.label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            </FadeInUp>
          ) : null}

          {subKey && schema ? (
            <FadeInUp key={`meta-${subKey}`}>
              <View style={tw`rounded-card bg-card border border-line/80 p-4 mb-4`}>
                <Text style={tw`text-caption font-semibold tracking-widest text-bloom-ink uppercase`}>
                  Goal essence
                </Text>
                <Text style={tw`text-sm text-ink-2 mt-1 leading-5 mb-4`}>{schema.hint}</Text>

                <Text style={tw`text-xs font-semibold text-ink-3 mb-1.5`}>
                  {schema.startLabel}
                  {schema.unitLabel ? ` (${schema.unitLabel})` : ''}
                </Text>
                <TextInput
                  value={startText}
                  onChangeText={setStartText}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 82"
                  placeholderTextColor={theme.colors.placeholder}
                  style={tw`bg-raised border border-line rounded-card px-4 py-3 text-ink text-callout font-semibold mb-3`}
                />

                <Text style={tw`text-xs font-semibold text-ink-3 mb-1.5`}>
                  {schema.targetLabel}
                  {schema.unitLabel ? ` (${schema.unitLabel})` : ''}
                </Text>
                <TextInput
                  value={targetText}
                  onChangeText={setTargetText}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 74"
                  placeholderTextColor={theme.colors.placeholder}
                  style={tw`bg-raised border border-line rounded-card px-4 py-3 text-ink text-callout font-semibold mb-1`}
                />
              </View>

              <Text style={tw`text-xs font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
                Name it
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Summer shape-up"
                placeholderTextColor={theme.colors.placeholder}
                style={tw`bg-card border border-line rounded-card px-4 py-3.5 text-ink text-body mb-4`}
              />

              <Text style={tw`text-xs font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
                Goal in detail
              </Text>
              <Text style={tw`text-sm text-ink-3 mb-2 leading-5`}>
                Why this matters, deadline, or how you’ll measure success beyond the numbers.
              </Text>
              <TextInput
                value={detail}
                onChangeText={setDetail}
                placeholder="e.g. Drop to 74kg by June for my sister’s wedding — weigh-ins every Monday"
                placeholderTextColor={theme.colors.placeholder}
                multiline
                style={tw`bg-card border border-line rounded-card px-4 py-3.5 text-ink text-body min-h-[96px] mb-6`}
              />
              <View style={tw`items-center mb-4`}>
                <SeedPlantVisual stage="seed" progress={0} size={100} />
              </View>
            </FadeInUp>
          ) : null}
        </ScrollView>

        <View
          style={tw`absolute left-0 right-0 bottom-0 px-gutter-wide pb-8 pt-3 bg-page border-t border-line/60`}
        >
          <PressableScale
            onPress={() => void onPlant()}
            disabled={!parentKey || !subKey || busy}
            feedback={false}
            style={tw`py-4 rounded-card bg-emerald-600 items-center flex-row justify-center gap-2 ${
              !parentKey || !subKey || busy ? 'opacity-50' : ''
            }`}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="leaf" size={18} color="#fff" />
            )}
            <Text style={tw`text-white font-bold text-callout`}>
              {busy ? 'Planting…' : 'Plant this seed'}
            </Text>
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
