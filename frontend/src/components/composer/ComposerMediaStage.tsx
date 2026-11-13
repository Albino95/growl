import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ReelVideoPlayer } from '../ui/VideoEditor';
import { fitMediaBox } from '../../utils/fitMediaBox';
import { COMPOSER_COPY } from '../../hooks/composerConfig';
import type { MediaComposer } from '../../hooks/useMediaComposer';
import PublishingOverlay from './PublishingOverlay';
import tw from '../../lib/tw';

type Props = {
  composer: MediaComposer;
  /** Small label on the stage (e.g. "Video · 30s max"). */
  badge?: string | null;
};

/**
 * The picked photo / clip, fitted to the flow's aspect (4:5 post, 9:16 reel and
 * story). Clips show a still until the user taps play (native players are
 * armed lazily), and the stage carries the editor-opening / publishing layer.
 */
export default function ComposerMediaStage({ composer, badge }: Props) {
  const { state, config, isVideo, previewArmed, clipStill, wantPlay, publishing } = composer;
  const media = state.media;
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [aw, ah] = config.aspect === '4:5' ? [4, 5] : [9, 16];
  const box = fitMediaBox(area.w, area.h, aw, ah);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - area.w) > 1 || Math.abs(height - area.h) > 1) {
      setArea({ w: width, h: height });
    }
  };

  if (!media) return null;
  const openingEditor = state.status === 'editing' && !state.editorShown;
  const canPlay =
    isVideo && !wantPlay && !state.stillsBusy && !openingEditor && !publishing && !!clipStill;

  return (
    <View style={tw`flex-1 min-h-0 items-center justify-center bg-black`} onLayout={onLayout}>
      {box.width > 0 ? (
        <View
          style={[tw`overflow-hidden bg-stone-950`, { width: box.width, height: box.height }]}
        >
          {isVideo ? (
            previewArmed ? (
              <ReelVideoPlayer
                key={media.uri}
                uri={media.uri}
                settings={state.videoEdit}
                shouldPlay={previewArmed && !publishing && !openingEditor}
                contentFit="cover"
                style={StyleSheet.absoluteFillObject}
              />
            ) : clipStill ? (
              <Image source={clipStill} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFillObject, tw`bg-black`]} />
            )
          ) : (
            <Image
              source={{ uri: media.uri }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              transition={160}
              accessibilityLabel="Selected photo"
            />
          )}
          {badge && !openingEditor ? (
            <View
              style={tw`absolute left-3 bottom-3 bg-black/55 px-2.5 py-1 rounded-full`}
              pointerEvents="none"
            >
              <Text style={tw`text-white text-xs font-semibold`}>{badge}</Text>
            </View>
          ) : null}
          {canPlay ? (
            <View pointerEvents="box-none" style={tw`absolute bottom-4 left-0 right-0 items-center z-20`}>
              <Pressable
                onPress={composer.play}
                style={tw`w-12 h-12 rounded-full bg-black/70 items-center justify-center border border-white/20`}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Play clip"
              >
                <Ionicons name="play" size={22} color="#fff" />
              </Pressable>
            </View>
          ) : null}
          {publishing ? (
            <PublishingOverlay variant="publishing" phase={state.phase} />
          ) : openingEditor ? (
            <PublishingOverlay variant="loading" label={COMPOSER_COPY.openingEditor} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
