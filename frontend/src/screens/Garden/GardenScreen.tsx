import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Animated,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { breathe, easing as motionEasing } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import PressableScale from '../../components/ui/PressableScale';
import FadeInUp from '../../components/ui/FadeInUp';
import EqualizerBars from '../../components/ui/EqualizerBars';
import SeedPlantVisual from '../../components/garden/SeedPlantVisual';
import { listSeeds, type GrowthSeed } from '../../services/api/seeds';
import { listGroups, type GrowthGroup } from '../../services/api/groups';
import SeatFill from '../../components/circles/SeatFill';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { feedback } from '../../utils/interactionFeedback';
import {
  GARDEN_SOUNDSCAPES,
  GUIDED_MEDITATIONS,
  type GuidedMeditation,
} from '../../components/garden/gardenAudio';

type Mode = 'grove' | 'relax';

const UNLOCKS: { trees: number; label: string; hint: string }[] = [
  { trees: 0, label: 'Soft rain', hint: 'Ambient sound in Relax' },
  { trees: 1, label: 'Forest air', hint: 'Second soundscape' },
  { trees: 3, label: 'Guided voice', hint: 'Human teachers — Arrive & Root' },
  { trees: 5, label: 'Witness meditation', hint: 'Deeper earth practice + brook' },
  { trees: 8, label: 'Full sanctuary', hint: '23‑min relax reading + all sounds' },
];

function formatClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Garden — Grove of matured trees + Relax sanctuary (music + human-voice meditations).
 */
export default function GardenScreen() {
  const navigation = useNavigation();
  const [mode, setMode] = useState<Mode>('grove');
  const [growing, setGrowing] = useState<GrowthSeed[]>([]);
  const [trees, setTrees] = useState<GrowthSeed[]>([]);
  const [circles, setCircles] = useState<GrowthGroup[]>([]);
  const [maturedCount, setMaturedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [breathLeft, setBreathLeft] = useState(0);
  const [soundId, setSoundId] = useState('rain');
  const [musicOn, setMusicOn] = useState(true);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [activeMeditation, setActiveMeditation] = useState<GuidedMeditation | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [voicePos, setVoicePos] = useState(0);
  const [voiceDur, setVoiceDur] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const voiceRef = useRef<Audio.Sound | null>(null);
  const breathAnim = useRef(new Animated.Value(0)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;
  const breathTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [g, garden, groups] = await Promise.all([
        listSeeds('growing'),
        listSeeds('garden'),
        listGroups().catch(() => null),
      ]);
      setGrowing(g.seeds);
      setTrees(garden.seeds);
      setMaturedCount(garden.matured_tree_count);
      setCircles((groups?.mine || []).slice(0, 6));
    } catch {
      setGrowing([]);
      setTrees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
      return () => {
        void stopMusic();
        void stopVoice();
        if (breathTimer.current) clearInterval(breathTimer.current);
      };
    }, [load])
  );

  const stopMusic = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch {
      /* ignore */
    }
  };

  const stopVoice = async () => {
    try {
      if (voiceRef.current) {
        await voiceRef.current.stopAsync();
        await voiceRef.current.unloadAsync();
        voiceRef.current = null;
      }
    } catch {
      /* ignore */
    }
    setVoicePlaying(false);
    setVoicePos(0);
    setVoiceDur(0);
    setVoiceLoading(false);
  };

  const duckAmbient = async (volume: number) => {
    try {
      if (soundRef.current) await soundRef.current.setVolumeAsync(volume);
    } catch {
      /* ignore */
    }
  };

  const playSoundscape = async (id: string, forceOn = false) => {
    const scape = GARDEN_SOUNDSCAPES.find((s) => s.id === id);
    if (!scape || maturedCount < scape.treesRequired) {
      feedback.error();
      setMusicError(
        maturedCount < (scape?.treesRequired ?? 0)
          ? `Unlock with ${scape?.treesRequired} trees`
          : 'Sound unavailable'
      );
      return;
    }
    setSoundId(id);
    const shouldPlay = forceOn || musicOn;
    if (!shouldPlay) return;
    if (forceOn) setMusicOn(true);
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        allowsRecordingIOS: false,
      });
      await stopMusic();
      const { sound } = await Audio.Sound.createAsync(scape.source, {
        isLooping: true,
        volume: voiceRef.current ? 0.16 : 0.55,
        shouldPlay: true,
      });
      soundRef.current = sound;
      setMusicError(null);
      feedback.select();
    } catch (e) {
      setMusicError(e instanceof Error ? e.message : 'Could not play sound');
      feedback.error();
    }
  };

  useEffect(() => {
    if (mode !== 'relax') {
      void stopMusic();
      void stopVoice();
      return;
    }
    if (musicOn) void playSoundscape(soundId);
    else void stopMusic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, musicOn, maturedCount]);

  const orbActive = breathLeft > 0 || voicePlaying;
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!orbActive) {
      breathAnim.setValue(0);
      ringAnim.setValue(0);
      return;
    }
    // Reduce Motion: the orb holds still (the countdown still paces the breath).
    if (reducedMotion) {
      breathAnim.setValue(0.5);
      ringAnim.setValue(0);
      return;
    }
    const loop = breathe(breathAnim, 0, 1, { period: 8000 });
    const rings = Animated.loop(
      Animated.timing(ringAnim, {
        toValue: 1,
        duration: 4200,
        easing: motionEasing.out,
        useNativeDriver: true,
      })
    );
    loop?.start();
    rings.start();
    return () => {
      loop?.stop();
      rings.stop();
    };
  }, [orbActive, breathAnim, ringAnim, reducedMotion]);

  const startBreathe = (seconds: number) => {
    if (maturedCount < 3) {
      feedback.error();
      return;
    }
    feedback.open();
    if (breathTimer.current) clearInterval(breathTimer.current);
    setBreathLeft(seconds);
    breathTimer.current = setInterval(() => {
      setBreathLeft((s) => {
        if (s <= 1) {
          if (breathTimer.current) clearInterval(breathTimer.current);
          feedback.success();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const onVoiceStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if ('error' in status && status.error) setVoiceError(String(status.error));
      return;
    }
    setVoicePlaying(status.isPlaying);
    setVoicePos(status.positionMillis || 0);
    setVoiceDur(status.durationMillis || 0);
    if (status.didJustFinish) {
      void duckAmbient(0.55);
      setVoicePlaying(false);
      feedback.success();
    }
  };

  const startMeditation = async (m: GuidedMeditation) => {
    if (maturedCount < m.treesRequired) {
      feedback.error();
      return;
    }
    feedback.open();
    setActiveMeditation(m);
    setVoiceError(null);
    setVoiceLoading(true);
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        allowsRecordingIOS: false,
      });
      if (voiceRef.current) {
        await voiceRef.current.unloadAsync();
        voiceRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: m.voiceUri },
        { shouldPlay: true, volume: 1, progressUpdateIntervalMillis: 400 }
      );
      voiceRef.current = sound;
      sound.setOnPlaybackStatusUpdate(onVoiceStatus);
      await duckAmbient(0.16);
      if (!musicOn) void playSoundscape(soundId, true);
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : 'Could not load the voice');
      feedback.error();
    } finally {
      setVoiceLoading(false);
    }
  };

  const toggleVoice = async () => {
    const sound = voiceRef.current;
    if (!sound) return;
    try {
      const st = await sound.getStatusAsync();
      if (!st.isLoaded) return;
      if (st.isPlaying) {
        await sound.pauseAsync();
        await duckAmbient(0.4);
      } else {
        await sound.playAsync();
        await duckAmbient(0.16);
      }
      feedback.select();
    } catch {
      feedback.error();
    }
  };

  const seekVoice = async (ratio: number) => {
    const sound = voiceRef.current;
    if (!sound || voiceDur <= 0) return;
    try {
      await sound.setPositionAsync(Math.max(0, Math.min(1, ratio)) * voiceDur);
    } catch {
      /* ignore */
    }
  };

  const w = Dimensions.get('window').width;
  const circleScale = breathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1.12],
  });
  const ringScale = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.28],
  });
  const ringOpacity = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0],
  });

  if (mode === 'relax') {
    return (
      <SafeAreaView style={tw`flex-1 bg-[#0B1210]`} edges={['top', 'bottom']}>
        <View style={tw`px-5 pt-2 flex-row items-center justify-between`}>
          <PressableScale
            onPress={() => {
              setMode('grove');
              setActiveMeditation(null);
              setBreathLeft(0);
              if (breathTimer.current) clearInterval(breathTimer.current);
              void stopVoice();
            }}
            feedback="close"
            style={tw`w-9 h-9 rounded-full bg-white/10 items-center justify-center`}
          >
            <Ionicons name="close" size={18} color="#fff" />
          </PressableScale>
          <View style={tw`flex-row items-center gap-2`}>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-400 uppercase`}>
              Relax
            </Text>
            {musicOn ? <EqualizerBars active color="#6EE7B7" /> : null}
          </View>
          <PressableScale
            onPress={() => {
              setMusicOn((v) => !v);
              feedback.select();
            }}
            feedback={false}
            style={tw`w-9 h-9 rounded-full bg-white/10 items-center justify-center`}
          >
            <Ionicons
              name={musicOn ? 'musical-notes' : 'musical-notes-outline'}
              size={16}
              color={musicOn ? '#6EE7B7' : '#78716C'}
            />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={tw`px-5 pb-12`} showsVerticalScrollIndicator={false}>
          <View style={tw`items-center mt-6 mb-8`}>
            <View style={{ width: w * 0.58, height: w * 0.58, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  width: w * 0.52,
                  height: w * 0.52,
                  borderRadius: w,
                  borderWidth: 1,
                  borderColor: 'rgba(110,231,183,0.45)',
                  transform: [{ scale: ringScale }],
                  opacity: ringOpacity,
                }}
              />
              <Animated.View
                style={{
                  width: w * 0.52,
                  height: w * 0.52,
                  borderRadius: w,
                  backgroundColor: 'rgba(5,150,105,0.14)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(110,231,183,0.35)',
                  transform: [{ scale: circleScale }],
                }}
              >
                <Text style={tw`text-5xl`}>
                  {voicePlaying || breathLeft > 0 ? '🫁' : '🌲'}
                </Text>
                {activeMeditation && (voiceDur > 0 || voiceLoading) ? (
                  <Text style={tw`text-white text-3xl font-bold mt-3`}>
                    {voiceLoading ? '…' : formatClock(Math.max(0, voiceDur - voicePos))}
                  </Text>
                ) : breathLeft > 0 ? (
                  <Text style={tw`text-white text-3xl font-bold mt-3`}>
                    {Math.floor(breathLeft / 60)}:{String(breathLeft % 60).padStart(2, '0')}
                  </Text>
                ) : (
                  <Text style={tw`text-emerald-300 text-sm mt-3 font-semibold`}>Your grove rests</Text>
                )}
              </Animated.View>
            </View>

            {activeMeditation ? (
              <View style={tw`mt-6 w-full px-1`}>
                <Text style={tw`text-emerald-400 text-[11px] font-bold tracking-widest uppercase text-center`}>
                  Voice · {activeMeditation.teacher}
                </Text>
                <Text style={tw`text-white text-xl font-semibold mt-2 text-center`}>
                  {activeMeditation.title}
                </Text>
                <Text style={tw`text-stone-400 text-sm mt-2 text-center leading-5`}>
                  Close your eyes. A real teacher will guide you — not a generated voice.
                </Text>

                <Pressable
                  onPress={(e) => {
                    const x = e.nativeEvent.locationX;
                    seekVoice(x / Math.max(1, w - 48));
                  }}
                  style={tw`mt-5 h-1.5 rounded-full bg-white/10 overflow-hidden`}
                >
                  <View
                    style={{
                      height: '100%',
                      width: `${voiceDur > 0 ? Math.min(100, (voicePos / voiceDur) * 100) : 0}%`,
                      backgroundColor: '#6EE7B7',
                      borderRadius: 99,
                    }}
                  />
                </Pressable>
                <View style={tw`flex-row justify-between mt-1.5`}>
                  <Text style={tw`text-[11px] text-stone-500`}>{formatClock(voicePos)}</Text>
                  <Text style={tw`text-[11px] text-stone-500`}>
                    {voiceDur > 0 ? formatClock(voiceDur) : `${activeMeditation.minutes} min`}
                  </Text>
                </View>

                {voiceError ? (
                  <Text style={tw`text-xs text-amber-400 mt-2 text-center`}>{voiceError}</Text>
                ) : null}

                <View style={tw`flex-row justify-center gap-2 mt-4`}>
                  <PressableScale
                    onPress={() => void toggleVoice()}
                    disabled={voiceLoading}
                    feedback="select"
                    style={tw`px-5 py-3 rounded-xl bg-emerald-700 flex-row items-center`}
                  >
                    {voiceLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons
                          name={voicePlaying ? 'pause' : 'play'}
                          size={16}
                          color="#fff"
                        />
                        <Text style={tw`text-white font-semibold ml-1.5`}>
                          {voicePlaying ? 'Pause' : 'Play voice'}
                        </Text>
                      </>
                    )}
                  </PressableScale>
                  <PressableScale
                    onPress={() => {
                      setActiveMeditation(null);
                      void stopVoice();
                      void duckAmbient(0.55);
                    }}
                    feedback="close"
                    style={tw`px-4 py-3 rounded-xl bg-white/10`}
                  >
                    <Text style={tw`text-white font-semibold`}>End</Text>
                  </PressableScale>
                </View>
                <Text style={tw`text-[11px] text-stone-600 mt-3 text-center`}>
                  {activeMeditation.teacher} · {activeMeditation.license}
                </Text>
              </View>
            ) : (
              <>
                <Text style={tw`text-white text-xl font-bold mt-8 text-center`}>
                  Be still for a moment
                </Text>
                <Text style={tw`text-stone-400 text-sm mt-2 text-center leading-5 px-2`}>
                  Rain under a human voice. Guided sessions unlock from your 3rd tree —
                  recorded teachers, never generated speech.
                </Text>
              </>
            )}
          </View>

          <View style={tw`flex-row items-center justify-between mb-2`}>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
              Soundscape
            </Text>
            <PressableScale
              onPress={() => {
                if (musicOn) {
                  setMusicOn(false);
                  void stopMusic();
                } else {
                  void playSoundscape(soundId, true);
                }
              }}
              feedback={false}
              style={tw`px-3 py-1.5 rounded-full ${musicOn ? 'bg-emerald-700' : 'bg-white/10'}`}
            >
              <Text style={tw`text-xs font-bold ${musicOn ? 'text-white' : 'text-stone-400'}`}>
                {musicOn ? 'Playing' : 'Play music'}
              </Text>
            </PressableScale>
          </View>
          {musicError ? (
            <Text style={tw`text-xs text-amber-400 mb-2`}>{musicError}</Text>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-6`}>
            {GARDEN_SOUNDSCAPES.map((s) => {
              const locked = maturedCount < s.treesRequired;
              const active = soundId === s.id && musicOn;
              return (
                <PressableScale
                  key={s.id}
                  onPress={() => {
                    if (locked) {
                      feedback.error();
                      setMusicError(`Grow ${s.treesRequired} trees to unlock`);
                      return;
                    }
                    void playSoundscape(s.id, true);
                  }}
                  feedback={false}
                  style={tw`mr-2.5 px-3.5 py-3 rounded-2xl border min-w-[120px] ${
                    active
                      ? 'bg-emerald-800 border-emerald-400'
                      : 'bg-white/5 border-white/10'
                  } ${locked ? 'opacity-40' : ''}`}
                >
                  <View style={tw`flex-row items-center mb-1`}>
                    <Ionicons
                      name={locked ? 'lock-closed' : active ? 'volume-high' : 'musical-notes'}
                      size={14}
                      color={active ? '#6EE7B7' : '#A8A29E'}
                    />
                    <Text
                      style={tw`ml-1.5 text-xs font-bold ${
                        active ? 'text-emerald-200' : 'text-stone-300'
                      }`}
                    >
                      {s.label}
                    </Text>
                  </View>
                  <Text style={tw`text-[11px] text-stone-500`}>
                    {locked ? `Need ${s.treesRequired} trees` : s.hint}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>

          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
            Breathe
          </Text>
          <View style={tw`flex-row gap-2 mb-6`}>
            {[60, 180, 300].map((sec) => (
              <PressableScale
                key={sec}
                onPress={() => {
                  setActiveMeditation(null);
                  void stopVoice();
                  startBreathe(sec);
                }}
                disabled={breathLeft > 0 || maturedCount < 3 || voicePlaying}
                feedback={false}
                style={tw`flex-1 py-3 rounded-2xl border border-emerald-800/60 bg-emerald-950/60 items-center ${
                  maturedCount < 3 || breathLeft > 0 || voicePlaying ? 'opacity-40' : ''
                }`}
              >
                <Text style={tw`text-emerald-300 font-bold`}>{sec / 60} min</Text>
              </PressableScale>
            ))}
          </View>

          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
            Guided voice
          </Text>
          {GUIDED_MEDITATIONS.map((m) => {
            const locked = maturedCount < m.treesRequired;
            const playingThis = activeMeditation?.id === m.id;
            return (
              <PressableScale
                key={m.id}
                onPress={() => void startMeditation(m)}
                disabled={locked}
                feedback={false}
                style={tw`mb-2 px-3.5 py-3.5 rounded-2xl border flex-row items-center ${
                  locked
                    ? 'bg-white/5 border-white/10 opacity-45'
                    : playingThis
                      ? 'bg-emerald-800/80 border-emerald-400/60'
                      : 'bg-emerald-950/50 border-emerald-800/50'
                }`}
              >
                <View
                  style={tw`w-10 h-10 rounded-xl items-center justify-center mr-3 ${
                    locked ? 'bg-white/10' : 'bg-emerald-700'
                  }`}
                >
                  <Ionicons
                    name={locked ? 'lock-closed' : playingThis ? 'volume-high' : 'mic-outline'}
                    size={18}
                    color={locked ? '#78716C' : '#fff'}
                  />
                </View>
                <View style={tw`flex-1`}>
                  <Text style={tw`text-sm font-bold text-white`}>{m.title}</Text>
                  <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                    {m.minutes} min · {m.teacher}
                    {locked ? ` · unlock at ${m.treesRequired} trees` : ''}
                  </Text>
                </View>
                {playingThis ? <EqualizerBars active={voicePlaying} /> : (
                  <Ionicons name="play" size={16} color="#57534E" />
                )}
              </PressableScale>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

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
          <View style={tw`flex-row items-center gap-2`}>
            <PressableScale
              onPress={() => navigateFromRoot(navigation, 'Circles')}
              feedback="open"
              style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
            >
              <Ionicons name="people-outline" size={16} color="#1C1917" />
            </PressableScale>
            <PressableScale
              onPress={() => {
                feedback.open();
                setMode('relax');
              }}
              feedback={false}
              style={tw`px-3 py-2 rounded-full bg-stone-900 flex-row items-center`}
            >
              <Ionicons name="moon-outline" size={14} color="#fff" />
              <Text style={tw`text-white text-xs font-bold ml-1`}>Relax</Text>
            </PressableScale>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={tw`px-5 pb-28`}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#059669" />
        }
      >
        <FadeInUp>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
            Garden
          </Text>
          <Text style={tw`text-[28px] font-bold text-stone-900 mt-0.5 leading-8`}>Your grove</Text>
          <Text style={tw`text-sm text-stone-500 mt-1.5 leading-5 mb-5`}>
            Mature trees unlock human-voice meditations. Circles keep the grove social.
          </Text>
        </FadeInUp>

        {loading ? (
          <ActivityIndicator color="#059669" style={tw`py-12`} />
        ) : (
          <>
            <View style={tw`rounded-[28px] overflow-hidden border border-stone-200/80 bg-[#FFFcf7] mb-5`}>
              <View style={tw`h-1.5 bg-emerald-600`} />
              <View style={[tw`px-4 py-6 min-h-[220px]`, { backgroundColor: '#ECFDF5' }]}>
                {trees.length === 0 ? (
                  <View style={tw`items-center py-6`}>
                    <SeedPlantVisual stage="seed" progress={0} size={72} />
                    <Text style={tw`text-lg font-bold text-stone-900 mt-8`}>Empty earth</Text>
                    <Text style={tw`text-sm text-stone-500 mt-1 text-center leading-5 px-4`}>
                      Water a seed with evidence until it’s ready, then call it home.
                    </Text>
                    <PressableScale
                      onPress={() => navigateFromRoot(navigation, 'PlantSeed')}
                      feedback="open"
                      style={tw`mt-4 px-5 py-3 rounded-xl bg-emerald-600`}
                    >
                      <Text style={tw`text-white font-bold`}>Plant a seed</Text>
                    </PressableScale>
                  </View>
                ) : (
                  <View style={tw`flex-row flex-wrap justify-center gap-x-6 gap-y-12 pt-2`}>
                    {trees.map((t, i) => (
                      <FadeInUp key={t.id} delay={i * 60}>
                        <PressableScale
                          onPress={() =>
                            navigateFromRoot(navigation, 'SeedDetail', { seedId: t.id })
                          }
                          feedback="open"
                          style={tw`items-center w-[100px]`}
                        >
                          <SeedPlantVisual
                            stage="mature"
                            progress={1}
                            size={74}
                            shared={t.ownership === 'shared'}
                          />
                          <Text
                            style={tw`text-[11px] font-semibold text-stone-800 mt-7 text-center`}
                            numberOfLines={2}
                          >
                            {t.title}
                          </Text>
                        </PressableScale>
                      </FadeInUp>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {growing.length > 0 ? (
              <View style={tw`mb-5`}>
                <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
                  Still growing
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {growing.map((s) => (
                    <PressableScale
                      key={s.id}
                      onPress={() =>
                        navigateFromRoot(navigation, 'SeedDetail', { seedId: s.id })
                      }
                      feedback="open"
                      style={tw`mr-4 items-center w-[100px]`}
                    >
                      <SeedPlantVisual
                        stage={s.stage}
                        progress={s.progress_to_mature}
                        size={68}
                        shared={s.ownership === 'shared'}
                        resting={s.status === 'resting'}
                      />
                      <Text
                        style={tw`text-[11px] font-semibold text-stone-800 mt-7 text-center`}
                        numberOfLines={2}
                      >
                        {s.title}
                      </Text>
                      {s.metric_current != null && s.metric_target != null ? (
                        <Text style={tw`text-[11px] text-bloom-ink font-bold mt-0.5`}>
                          {s.metric_current}/{s.metric_target}
                          {s.metric_unit ? ` ${s.metric_unit}` : ''}
                        </Text>
                      ) : null}
                    </PressableScale>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={tw`mb-5`}>
              <View style={tw`flex-row items-center justify-between mb-3`}>
                <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase`}>
                  Your circles
                </Text>
                <PressableScale
                  onPress={() => navigateFromRoot(navigation, 'Circles')}
                  feedback="open"
                >
                  <Text style={tw`text-xs font-bold text-emerald-700`}>See all</Text>
                </PressableScale>
              </View>
              {circles.length === 0 ? (
                <PressableScale
                  onPress={() => navigateFromRoot(navigation, 'Circles')}
                  feedback="open"
                  style={tw`px-3.5 py-3.5 rounded-2xl border border-stone-200/80 bg-[#FFFcf7] flex-row items-center`}
                >
                  <View style={tw`w-10 h-10 rounded-xl bg-emerald-50 items-center justify-center mr-3`}>
                    <Ionicons name="people-outline" size={18} color="#059669" />
                  </View>
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-sm font-bold text-stone-900`}>Find a circle of 10</Text>
                    <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                      We’ll seat you nearby, by matching, or at random.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#A8A29E" />
                </PressableScale>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {circles.map((c) => (
                    <PressableScale
                      key={c.id}
                      onPress={() =>
                        navigateFromRoot(navigation, 'CircleDetail', { groupId: c.id })
                      }
                      feedback="open"
                      style={tw`mr-2.5 px-3.5 py-3 rounded-2xl border border-stone-200/80 bg-[#FFFcf7] min-w-[148px]`}
                    >
                      <Text style={tw`text-sm font-bold text-stone-900`} numberOfLines={2}>
                        {c.name}
                      </Text>
                      <View style={tw`mt-2`}>
                        <SeatFill filled={c.member_count} max={c.max_members || 10} />
                      </View>
                    </PressableScale>
                  ))}
                </ScrollView>
              )}
            </View>

            <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
              Unlocks · {maturedCount} tree{maturedCount === 1 ? '' : 's'}
            </Text>
            {UNLOCKS.map((u) => {
              const unlocked = maturedCount >= u.trees;
              return (
                <View
                  key={u.trees}
                  style={tw`mb-2 px-3.5 py-3 rounded-2xl border flex-row items-center ${
                    unlocked
                      ? 'bg-emerald-50 border-emerald-100'
                      : 'bg-[#FFFcf7] border-stone-200/80'
                  }`}
                >
                  <View
                    style={tw`w-9 h-9 rounded-xl items-center justify-center mr-3 ${
                      unlocked ? 'bg-emerald-600' : 'bg-[#EAE4D6]'
                    }`}
                  >
                    <Ionicons
                      name={unlocked ? 'checkmark' : 'lock-closed'}
                      size={16}
                      color={unlocked ? '#fff' : '#78716C'}
                    />
                  </View>
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-sm font-bold text-stone-900`}>{u.label}</Text>
                    <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                      {u.hint}
                      {!unlocked ? ` · need ${u.trees}` : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <View style={tw`absolute left-0 right-0 bottom-0 px-5 pb-8 pt-2`}>
        <PressableScale
          onPress={() => navigateFromRoot(navigation, 'PlantSeed')}
          feedback="open"
          style={tw`py-4 rounded-2xl bg-emerald-600 items-center flex-row justify-center gap-2`}
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={tw`text-white font-bold text-[16px]`}>Plant a seed</Text>
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}
