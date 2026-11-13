import React from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { badgeVisual } from './badgeMeta';

type Props = {
  id: string;
  /** Outer diameter in px. */
  size?: number;
  locked?: boolean;
  tier?: 'common' | 'rare';
  style?: StyleProp<ViewStyle>;
};

const RARE_RING = '#F59E0B';
const RARE_RING_OUTER = '#F97066';

/**
 * Badge medallion built from Views: rim → face → emoji.
 * Rare tier gets a coral/gold double ring; locked shows a muted silhouette.
 */
export default function BadgeIcon({ id, size = 56, locked = false, tier = 'common', style }: Props) {
  const v = badgeVisual(id);
  const rare = tier === 'rare' && !locked;
  const ring = rare ? Math.max(2, Math.round(size * 0.06)) : Math.max(1.5, Math.round(size * 0.04));
  const face = size - ring * 2 - (rare ? ring * 2 : 0);

  const faceView = (
    <View
      style={{
        width: face,
        height: face,
        borderRadius: face / 2,
        backgroundColor: locked ? '#E7E2D6' : v.tint,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* soft highlight for a minted look */}
      {!locked ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -face * 0.35,
            left: -face * 0.15,
            width: face * 1.1,
            height: face * 0.75,
            borderRadius: face,
            backgroundColor: 'rgba(255,255,255,0.18)',
          }}
        />
      ) : null}
      {locked ? (
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: face * 0.48, opacity: 0.22 }}>{v.emoji}</Text>
          <View style={{ position: 'absolute', bottom: -face * 0.02 }}>
            <Ionicons name="lock-closed" size={Math.max(10, face * 0.22)} color="#A8A29E" />
          </View>
        </View>
      ) : (
        <Text style={{ fontSize: face * 0.5 }}>{v.emoji}</Text>
      )}
    </View>
  );

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: locked ? '#F3EEE4' : rare ? RARE_RING_OUTER : v.soft,
          borderWidth: locked ? 1.5 : 0,
          borderStyle: locked ? 'dashed' : 'solid',
          borderColor: '#D6CFC0',
        },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {rare ? (
        <View
          style={{
            width: size - ring * 2,
            height: size - ring * 2,
            borderRadius: size,
            backgroundColor: RARE_RING,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {faceView}
        </View>
      ) : (
        faceView
      )}
    </View>
  );
}
