import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus, type AudioSource } from 'expo-audio';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { proofMediaSource, type Proof } from '../../services/api/proofs';
import { formatClock } from './proofDefaults';

type Source = { uri: string; headers: Record<string, string> };

/**
 * Loads the auth-required media source for a proof. On a failed load call
 * `retry()` once: it refreshes the session (expired access token) and rebuilds
 * the headers.
 */
function useProofSource(proof: Pick<Proof, 'id' | 'media_url'>) {
  const [source, setSource] = useState<Source | null>(null);
  const [failed, setFailed] = useState(false);
  const retried = useRef(false);
  useEffect(() => {
    let alive = true;
    retried.current = false;
    setFailed(false);
    setSource(null);
    void proofMediaSource(proof).then((s) => {
      if (alive) setSource(s);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proof.id, proof.media_url]);
  const retry = () => {
    if (retried.current) {
      setFailed(true);
      return;
    }
    retried.current = true;
    void proofMediaSource(proof, { refresh: true }).then((s) => setSource(s));
  };
  return { source, failed, retry };
}

/**
 * Small play / pause control with elapsed time. `source` may be a local file
 * (recording preview) or the private proof URL with an Authorization header.
 */
export function ProofAudio({
  source,
  durationS,
  dark = false,
  onError,
}: {
  source: AudioSource;
  durationS?: number | null;
  dark?: boolean;
  onError?: () => void;
}) {
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const total = status.duration > 0 ? status.duration : durationS ?? 0;
  const playing = status.playing;

  useEffect(() => {
    if (status.didJustFinish) {
      void player.seekTo(0).catch(() => undefined);
    }
  }, [status.didJustFinish, player]);

  const errored = (status as { playbackState?: string }).playbackState === 'failed';
  useEffect(() => {
    if (errored) onError?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errored]);

  const toggle = () => {
    if (playing) player.pause();
    else player.play();
  };
  const ink = dark ? '#FFFFFF' : theme.colors.ink;
  return (
    <View style={tw`flex-row items-center`}>
      <PressableScale
        feedback="selection"
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
        style={tw`w-11 h-11 rounded-full items-center justify-center ${dark ? 'bg-white/20' : 'bg-emerald-600'}`}
      >
        <Ionicons name={playing ? 'pause' : 'play'} size={20} color="#FFFFFF" />
      </PressableScale>
      <View style={tw`flex-1 ml-3`}>
        <View style={tw`h-1.5 rounded-full ${dark ? 'bg-white/20' : 'bg-raised'} overflow-hidden`}>
          <View
            style={[
              tw`h-1.5 ${dark ? 'bg-white' : 'bg-emerald-600'}`,
              { width: `${total > 0 ? Math.min(100, (status.currentTime / total) * 100) : 0}%` },
            ]}
          />
        </View>
        <Text style={[tw`text-caption mt-1`, { color: ink, fontVariant: ['tabular-nums'] }]}>
          {formatClock(status.currentTime * 1000)} / {formatClock(total * 1000)}
        </Text>
      </View>
    </View>
  );
}

type Props = {
  proof: Pick<Proof, 'id' | 'kind' | 'media_url' | 'media_expired' | 'duration_s'>;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  /** Dark backdrop (viewer). */
  dark?: boolean;
  accessibilityLabel?: string;
};

/**
 * Private proof media (photo or voice). Loads GET /proofs/:id/media with the
 * user's Bearer token — never a public URL, never cached on disk.
 */
export default function ProofMedia({ proof, style, contentFit = 'cover', dark = false, accessibilityLabel }: Props) {
  const { source, failed, retry } = useProofSource(proof);

  if (!proof.media_url) {
    return (
      <View style={[tw`items-center justify-center bg-raised`, style]}>
        <Ionicons name={proof.kind === 'voice' ? 'mic-off-outline' : 'image-outline'} size={18} color={theme.colors.iconMuted} />
        {proof.media_expired ? (
          <Text style={tw`text-caption text-ink-3 mt-1 text-center px-2`}>Removed after its keep period</Text>
        ) : null}
      </View>
    );
  }
  if (failed) {
    return (
      <View style={[tw`items-center justify-center bg-raised`, style]}>
        <Ionicons name="cloud-offline-outline" size={18} color={theme.colors.iconMuted} />
      </View>
    );
  }
  if (!source) {
    return (
      <View style={[tw`items-center justify-center bg-raised`, style]}>
        <ActivityIndicator color={theme.colors.iconMuted} />
      </View>
    );
  }
  if (proof.kind === 'voice') {
    return (
      <View style={style}>
        <ProofAudio source={source} durationS={proof.duration_s} dark={dark} onError={retry} />
      </View>
    );
  }
  return (
    <Image
      source={source}
      style={style as StyleProp<ImageStyle>}
      contentFit={contentFit}
      // Private: keep it in memory only, never in the shared disk cache.
      cachePolicy="memory"
      recyclingKey={proof.id}
      transition={120}
      onError={retry}
      accessibilityLabel={accessibilityLabel ?? 'Proof photo'}
    />
  );
}
