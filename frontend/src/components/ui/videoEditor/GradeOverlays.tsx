import React from 'react';
import { View, StyleSheet } from 'react-native';
import tw from '../../../lib/tw';
import type { EditAdjustments } from '../photoEditor/types';
import { DEFAULT_ADJUSTMENTS } from '../photoEditor/types';
import { mergeAdjustments } from '../photoEditor/filterEngine';
import type { VideoEditSettings, VideoLookId } from './types';
import { getVideoLook } from './types';
import { videoCinematicStrength, videoVignetteStrength } from './videoFilters';

function n(v: number | undefined): number {
  return Number.isFinite(v) ? (v as number) : 0;
}

/** Native-visible grade. CSS filters do nothing on expo-av Video. */
export function AdjustmentOverlays({ adj }: { adj: EditAdjustments }) {
  const lift = (n(adj.exposure) + n(adj.brightness) + n(adj.highlights) * 0.35) / 90;
  const warmth = n(adj.warmth) / 70;
  const tint = n(adj.tint) / 80;
  const hue = n(adj.hue) / 80;
  const fade = Math.max(0, n(adj.fade)) / 140;
  const gray = Math.max(0, n(adj.grayscale)) / 150;
  const satLoss = Math.max(0, -n(adj.saturation)) / 140;
  const sepia = Math.max(0, n(adj.sepia)) / 180;
  const contrastDark = Math.max(0, n(adj.contrast)) / 220;
  const contrastLift = Math.max(0, -n(adj.contrast)) / 200;
  const shadowLift = Math.max(0, n(adj.shadows)) / 220;
  const shadowCrush = Math.max(0, -n(adj.shadows)) / 180;
  const grain = Math.max(0, n(adj.grain)) / 180;

  return (
    <>
      {lift > 0.02 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(255,255,255,${Math.min(0.42, lift * 0.38)})` },
          ]}
        />
      ) : null}
      {lift < -0.02 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(0,0,0,${Math.min(0.5, -lift * 0.44)})` },
          ]}
        />
      ) : null}
      {warmth > 0.04 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(212,140,50,${Math.min(0.3, warmth * 0.22)})` },
          ]}
        />
      ) : null}
      {warmth < -0.04 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(60,110,190,${Math.min(0.3, -warmth * 0.22)})` },
          ]}
        />
      ) : null}
      {tint > 0.05 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(236,72,153,${Math.min(0.22, tint * 0.2)})` },
          ]}
        />
      ) : null}
      {tint < -0.05 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(34,197,94,${Math.min(0.22, -tint * 0.2)})` },
          ]}
        />
      ) : null}
      {hue > 0.05 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(168,85,247,${Math.min(0.2, hue * 0.18)})` },
          ]}
        />
      ) : null}
      {hue < -0.05 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(20,184,166,${Math.min(0.2, -hue * 0.18)})` },
          ]}
        />
      ) : null}
      {sepia > 0.04 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(180,120,60,${Math.min(0.28, sepia)})` },
          ]}
        />
      ) : null}
      {fade > 0.02 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(243,238,228,${Math.min(0.28, fade)})` },
          ]}
        />
      ) : null}
      {gray > 0.05 || satLoss > 0.08 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(120,120,120,${Math.min(0.48, gray + satLoss * 0.55)})` },
          ]}
        />
      ) : null}
      {contrastDark > 0.04 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(0,0,0,${Math.min(0.2, contrastDark)})` },
          ]}
        />
      ) : null}
      {contrastLift > 0.04 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(255,255,255,${Math.min(0.18, contrastLift)})` },
          ]}
        />
      ) : null}
      {shadowLift > 0.04 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(255,255,255,${Math.min(0.14, shadowLift)})` },
          ]}
        />
      ) : null}
      {shadowCrush > 0.04 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(0,0,0,${Math.min(0.2, shadowCrush)})` },
          ]}
        />
      ) : null}
      {grain > 0.04 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(28,25,23,${Math.min(0.16, grain)})` },
          ]}
        />
      ) : null}
    </>
  );
}

export function LookLayerOverlays({ lookId }: { lookId: VideoLookId | string }) {
  const look = getVideoLook(lookId);
  return (
    <>
      {look.layers.map((layer, i) => (
        <View
          key={`${look.id}-${i}`}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: layer.color, opacity: layer.opacity ?? 1 },
          ]}
        />
      ))}
    </>
  );
}

export function VideoGradeStack({ edit }: { edit: VideoEditSettings }) {
  const adj = mergeAdjustments(edit.filterPresetId, edit.manualAdjust || DEFAULT_ADJUSTMENTS);
  const vignetteStrength = videoVignetteStrength(edit);
  const cinematicStrength = videoCinematicStrength(edit);
  return (
    <>
      <AdjustmentOverlays adj={adj} />
      <LookLayerOverlays lookId={edit.lookId} />
      {vignetteStrength > 0 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(0,0,0,${vignetteStrength * 0.38})` },
          ]}
        />
      ) : null}
      {cinematicStrength > 0 ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <View
            style={[
              tw`absolute top-0 left-0 right-0`,
              {
                height: `${12 + cinematicStrength * 18}%`,
                backgroundColor: 'rgba(0,0,0,0.58)',
              },
            ]}
          />
          <View
            style={[
              tw`absolute bottom-0 left-0 right-0`,
              {
                height: `${14 + cinematicStrength * 20}%`,
                backgroundColor: 'rgba(0,0,0,0.62)',
              },
            ]}
          />
        </View>
      ) : null}
    </>
  );
}
