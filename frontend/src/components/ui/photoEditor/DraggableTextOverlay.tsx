import React, { useMemo, useRef, useState } from 'react';
import { View, Text, PanResponder, StyleSheet } from 'react-native';
import type { TextOverlay } from './types';
import tw from '../../../lib/tw';

type Props = {
  overlay: TextOverlay;
  selected: boolean;
  containerW: number;
  containerH: number;
  /** When false, overlay is display-only. */
  editable?: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
};

/** Freely positioned text sticker — press and drag anywhere on the label. */
export default function DraggableTextOverlay({
  overlay,
  selected,
  containerW,
  containerH,
  editable = true,
  onSelect,
  onMove,
}: Props) {
  const [size, setSize] = useState({ w: 80, h: 36 });
  const startRef = useRef({ x: overlay.x, y: overlay.y });
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => editable,
        onMoveShouldSetPanResponder: () => editable,
        onPanResponderGrant: () => {
          onSelect();
          startRef.current = { x: overlayRef.current.x, y: overlayRef.current.y };
        },
        onPanResponderMove: (_evt, gesture) => {
          if (!containerW || !containerH) return;
          const nextX = Math.max(
            0.06,
            Math.min(0.94, startRef.current.x + gesture.dx / containerW)
          );
          const nextY = Math.max(
            0.06,
            Math.min(0.94, startRef.current.y + gesture.dy / containerH)
          );
          onMove(nextX, nextY);
        },
      }),
    [editable, containerW, containerH, onSelect, onMove]
  );

  if (!overlay.text.trim() || containerW <= 0 || containerH <= 0) return null;

  const left = overlay.x * containerW - size.w / 2;
  const top = overlay.y * containerH - size.h / 2;

  return (
    <View
      {...(editable ? pan.panHandlers : {})}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) setSize({ w: width, h: height });
      }}
      style={[
        tw`absolute px-2 py-1`,
        {
          left,
          top,
          transform: [{ scale: overlay.scale }],
          backgroundColor:
            overlay.style === 'pill' || overlay.style === 'banner'
              ? 'rgba(0,0,0,0.55)'
              : 'transparent',
          borderRadius: overlay.style === 'pill' ? 999 : overlay.style === 'banner' ? 4 : 0,
          paddingHorizontal: overlay.style === 'banner' ? 14 : 8,
          paddingVertical: overlay.style === 'banner' ? 6 : 4,
          borderWidth: selected ? 1.5 : 0,
          borderColor: '#34D399',
          borderStyle: 'dashed',
          zIndex: selected ? 20 : 10,
        },
      ]}
    >
      <Text
        style={{
          color: overlay.color,
          fontSize: overlay.style === 'bold' ? 24 : 20,
          fontWeight: overlay.style === 'plain' ? '600' : '800',
          textAlign: overlay.align || 'center',
          letterSpacing: overlay.style === 'neon' ? 1.2 : 0.2,
          textShadowColor:
            overlay.style === 'outline' ||
            overlay.style === 'bold' ||
            overlay.style === 'neon' ||
            overlay.style === 'shadow'
              ? overlay.style === 'neon'
                ? overlay.color
                : 'rgba(0,0,0,0.9)'
              : 'transparent',
          textShadowOffset: { width: 0, height: overlay.style === 'shadow' ? 3 : 1 },
          textShadowRadius:
            overlay.style === 'neon'
              ? 10
              : overlay.style === 'outline' || overlay.style === 'bold'
                ? 4
                : overlay.style === 'shadow'
                  ? 6
                  : 0,
        }}
      >
        {overlay.text}
      </Text>
      {selected && editable ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            tw`rounded-md`,
            { borderWidth: 0 },
          ]}
        />
      ) : null}
    </View>
  );
}
