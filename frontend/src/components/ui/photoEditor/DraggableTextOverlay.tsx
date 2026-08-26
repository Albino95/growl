import React, { useRef, useState } from 'react';
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
  const [size, setSize] = useState({ w: 100, h: 40 });
  const startRef = useRef({ x: overlay.x, y: overlay.y });
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const containerRef = useRef({ w: containerW, h: containerH });
  containerRef.current = { w: containerW, h: containerH };
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const onSelectRef = useRef(onSelect);
  const onMoveRef = useRef(onMove);
  onSelectRef.current = onSelect;
  onMoveRef.current = onMove;

  // Stable PanResponder — never recreated mid-drag (callback refs only).
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => editableRef.current,
      onStartShouldSetPanResponderCapture: () => editableRef.current,
      onMoveShouldSetPanResponder: (_e, g) =>
        editableRef.current && (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
      onMoveShouldSetPanResponderCapture: () => editableRef.current,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        onSelectRef.current();
        startRef.current = { x: overlayRef.current.x, y: overlayRef.current.y };
      },
      onPanResponderMove: (_evt, gesture) => {
        const { w, h } = containerRef.current;
        if (!w || !h) return;
        const nextX = Math.max(
          0.05,
          Math.min(0.95, startRef.current.x + gesture.dx / w)
        );
        const nextY = Math.max(
          0.05,
          Math.min(0.95, startRef.current.y + gesture.dy / h)
        );
        onMoveRef.current(nextX, nextY);
      },
    })
  ).current;

  if (!overlay.text.trim() || containerW <= 0 || containerH <= 0) return null;

  const left = overlay.x * containerW - size.w / 2;
  const top = overlay.y * containerH - size.h / 2;

  return (
    <View
      {...(editable ? pan.panHandlers : {})}
      collapsable={false}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) setSize({ w: width, h: height });
      }}
      style={[
        tw`absolute px-3 py-2`,
        {
          left,
          top,
          minWidth: 72,
          minHeight: 36,
          transform: [{ scale: overlay.scale }],
          backgroundColor:
            overlay.style === 'pill' || overlay.style === 'banner'
              ? 'rgba(0,0,0,0.55)'
              : selected && editable
                ? 'rgba(0,0,0,0.18)'
                : 'transparent',
          borderRadius: overlay.style === 'pill' ? 999 : overlay.style === 'banner' ? 4 : 8,
          paddingHorizontal: overlay.style === 'banner' ? 14 : 10,
          paddingVertical: overlay.style === 'banner' ? 6 : 6,
          borderWidth: selected ? 1.5 : 0,
          borderColor: '#34D399',
          borderStyle: 'dashed',
          zIndex: selected ? 50 : 40,
          elevation: selected ? 12 : 8,
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
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, tw`rounded-md`]} />
      ) : null}
    </View>
  );
}
