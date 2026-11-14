import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from '../PressableScale';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';
import GrowLoader from '../GrowLoader';
import { cacheRemoteClip, isLocalClipUri } from '../../../utils/cacheRemoteClip';

type ContentFit = 'cover' | 'contain';

type Props = {
  uri: string;
  shouldPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  volume?: number;
  playbackRate?: number;
  contentFit?: ContentFit;
  style?: StyleProp<ViewStyle>;
  useNativeControls?: boolean;
  /** Explicit seek in ms. Applied when seekMs or seekGeneration changes. */
  seekMs?: number | null;
  seekGeneration?: number;
  onEnded?: () => void;
  onProgress?: (positionMs: number, durationMs: number) => void;
  onReady?: () => void;
};

function videoSource(uri: string): VideoSource {
  return {
    uri,
    contentType: 'auto',
    useCaching: false,
  };
}

function usePlayableUri(uri: string): {
  playableUri: string;
  preparing: boolean;
  failed: boolean;
  retry: () => void;
} {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [playableUri, setPlayableUri] = useState(() =>
    Platform.OS === 'web' || isLocalClipUri(uri) ? uri : ''
  );
  const [preparing, setPreparing] = useState(
    () => Platform.OS !== 'web' && !isLocalClipUri(uri) && Boolean(uri)
  );

  useEffect(() => {
    if (!uri) {
      setPlayableUri('');
      setPreparing(false);
      return;
    }
    if (Platform.OS === 'web' || isLocalClipUri(uri)) {
      setPlayableUri(uri);
      setPreparing(false);
      return;
    }
    let cancelled = false;
    setPlayableUri('');
    setPreparing(true);
    setFailed(false);
    cacheRemoteClip(uri)
      .then((local) => {
        if (cancelled) return;
        if (!local) throw new Error('Clip could not be prepared');
        setPlayableUri(local);
        setPreparing(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Show a retry instead of spinning forever.
        console.warn('[NativeClipPlayer] could not prepare clip', error);
        setPreparing(false);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uri, attempt]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);
  return { playableUri, preparing, failed, retry };
}

type ArmedProps = Omit<Props, 'uri'> & { uri: string };

function ArmedNativeClip({
  uri,
  shouldPlay = true,
  loop = true,
  muted = false,
  volume = 1,
  playbackRate = 1,
  contentFit = 'cover',
  style,
  useNativeControls = false,
  seekMs = null,
  seekGeneration = 0,
  onEnded,
  onProgress,
  onReady,
}: ArmedProps) {
  const shouldPlayRef = useRef(shouldPlay);
  shouldPlayRef.current = shouldPlay;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const player = useVideoPlayer(videoSource(uri), (p) => {
    p.loop = loop;
    p.muted = muted;
    p.volume = Math.max(0, Math.min(1, volume));
    p.playbackRate = playbackRate || 1;
    p.audioMixingMode = 'mixWithOthers';
    p.staysActiveInBackground = false;
    p.showNowPlayingNotification = false;
    p.timeUpdateEventInterval = onProgress ? 0.1 : 0;
    if (seekMs != null && Number.isFinite(seekMs)) {
      try {
        p.currentTime = Math.max(0, seekMs / 1000);
      } catch {
        /* not ready */
      }
    }
  });

  useEffect(() => {
    player.loop = loop;
    player.muted = muted;
    player.volume = Math.max(0, Math.min(1, volume));
    player.playbackRate = playbackRate || 1;
  }, [loop, muted, volume, playbackRate, player]);

  useEffect(() => {
    if (seekMs == null || !Number.isFinite(seekMs)) return;
    try {
      player.currentTime = Math.max(0, seekMs / 1000);
      if (shouldPlayRef.current) player.play();
    } catch {
      /* not ready yet */
    }
  }, [seekMs, seekGeneration, player]);

  useEffect(() => {
    try {
      if (shouldPlay) player.play();
      else player.pause();
    } catch {
      /* not ready yet */
    }
  }, [shouldPlay, player]);

  useEffect(() => {
    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        onReadyRef.current?.();
        if (shouldPlayRef.current) {
          try {
            player.play();
          } catch {
            /* ignore */
          }
        }
      }
    });
    const endSub = player.addListener('playToEnd', () => {
      onEndedRef.current?.();
    });
    const timeSub = player.addListener('timeUpdate', ({ currentTime }) => {
      onProgressRef.current?.(currentTime * 1000, (player.duration || 0) * 1000);
    });
    return () => {
      try {
        player.pause();
      } catch {
        /* tearing down */
      }
      statusSub.remove();
      endSub.remove();
      timeSub.remove();
    };
  }, [player]);

  return (
    <View style={[StyleSheet.absoluteFillObject, style]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit={contentFit}
        nativeControls={useNativeControls}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        playsInline
        allowsVideoFrameAnalysis={false}
      />
    </View>
  );
}

/**
 * Native clip surface. HTTP URLs are copied to disk first so AVPlayer never
 * streams /media. VideoView mounts only after that copy exists.
 */
export default function NativeClipPlayer({ uri, style, ...rest }: Props) {
  const { playableUri, preparing, failed, retry } = usePlayableUri(uri);

  if (!playableUri) {
    return (
      <View style={[StyleSheet.absoluteFillObject, style, { backgroundColor: '#000' }]}>
        {preparing ? (
          <View style={twCenter}>
            <GrowLoader label="Loading video…" />
          </View>
        ) : failed ? (
          <View style={twCenter}>
            <Text style={styles.failText}>Couldn’t load this clip</Text>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Try loading the clip again"
              onPress={retry}
              feedback="selection"
              style={styles.retry}
            >
              <Ionicons name="refresh" size={16} color="#FFFFFF" />
              <Text style={styles.retryText}>Try again</Text>
            </PressableScale>
          </View>
        ) : null}
      </View>
    );
  }

  return <ArmedNativeClip key={playableUri} uri={playableUri} style={style} {...rest} />;
}

const styles = StyleSheet.create({
  failText: { color: 'rgba(255,255,255,0.85)', fontSize: 15, marginBottom: 12 },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  retryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});

const twCenter = {
  ...StyleSheet.absoluteFillObject,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
