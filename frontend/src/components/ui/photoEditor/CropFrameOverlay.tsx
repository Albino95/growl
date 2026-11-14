import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import tw from '../../../lib/tw';
import type { CropAspect } from './types';

/** Parse "4:5" → 0.8. Free returns null. */
export function aspectRatioValue(aspect: CropAspect): number | null {
  if (aspect === 'free') return null;
  const [w, h] = aspect.split(':').map(Number);
  if (!w || !h) return null;
  return w / h;
}

/**
 * Frame overlay for the crop tab: dimmed outside, rule-of-thirds grid,
 * optional aspect window. Pan happens on the parent Pressable.
 */
export default function CropFrameOverlay({
  aspect,
  containerW,
  containerH,
}: {
  aspect: CropAspect;
  containerW: number;
  containerH: number;
}) {
  const frame = useMemo(() => {
    const ratio = aspectRatioValue(aspect);
    if (!ratio || containerW <= 0 || containerH <= 0) {
      return { left: 0, top: 0, width: containerW, height: containerH };
    }
    const boxRatio = containerW / containerH;
    let width = containerW;
    let height = containerH;
    if (boxRatio > ratio) {
      width = containerH * ratio;
    } else {
      height = containerW / ratio;
    }
    return {
      left: (containerW - width) / 2,
      top: (containerH - height) / 2,
      width,
      height,
    };
  }, [aspect, containerW, containerH]);

  const thirdsV = [1 / 3, 2 / 3].map((t) => frame.left + frame.width * t);
  const thirdsH = [1 / 3, 2 / 3].map((t) => frame.top + frame.height * t);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Dim outside the crop window */}
      <View style={[tw`absolute bg-black/55`, { left: 0, top: 0, right: 0, height: frame.top }]} />
      <View
        style={[
          tw`absolute bg-black/55`,
          { left: 0, top: frame.top + frame.height, right: 0, bottom: 0 },
        ]}
      />
      <View
        style={[
          tw`absolute bg-black/55`,
          { left: 0, top: frame.top, width: frame.left, height: frame.height },
        ]}
      />
      <View
        style={[
          tw`absolute bg-black/55`,
          {
            left: frame.left + frame.width,
            top: frame.top,
            right: 0,
            height: frame.height,
          },
        ]}
      />

      {/* Crop border */}
      <View
        style={[
          tw`absolute border-2 border-white/90`,
          {
            left: frame.left,
            top: frame.top,
            width: frame.width,
            height: frame.height,
          },
        ]}
      />

      {/* Rule of thirds */}
      {thirdsV.map((x) => (
        <View
          key={`v-${x}`}
          style={[
            tw`absolute bg-white/35`,
            { left: x, top: frame.top, width: StyleSheet.hairlineWidth * 2, height: frame.height },
          ]}
        />
      ))}
      {thirdsH.map((y) => (
        <View
          key={`h-${y}`}
          style={[
            tw`absolute bg-white/35`,
            { left: frame.left, top: y, width: frame.width, height: StyleSheet.hairlineWidth * 2 },
          ]}
        />
      ))}

      {/* Corner marks */}
      {[
        { left: frame.left - 1, top: frame.top - 1 },
        { left: frame.left + frame.width - 17, top: frame.top - 1 },
        { left: frame.left - 1, top: frame.top + frame.height - 17 },
        { left: frame.left + frame.width - 17, top: frame.top + frame.height - 17 },
      ].map((pos, i) => (
        <View
          key={i}
          style={[
            tw`absolute w-[18px] h-[18px] border-white`,
            {
              left: pos.left,
              top: pos.top,
              borderTopWidth: i < 2 ? 3 : 0,
              borderBottomWidth: i >= 2 ? 3 : 0,
              borderLeftWidth: i % 2 === 0 ? 3 : 0,
              borderRightWidth: i % 2 === 1 ? 3 : 0,
            },
          ]}
        />
      ))}
    </View>
  );
}
