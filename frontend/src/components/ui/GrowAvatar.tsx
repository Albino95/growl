import React, { useEffect, useMemo, useState } from 'react';
import { Image, type ImageStyle } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../../lib/tw';
import { DEFAULT_AVATAR_ASSET, avatarSource, resolveAvatarUrl } from '../../utils/images';

type Props = {
  userId?: string;
  username?: string;
  /** Raw avatar string from the API (any form — resolved here). */
  uri?: string | null;
  /**
   * Alternative to `uri`: any user-like API object (post, post.metadata, story,
   * comment.user, friend, search hit…). Used when `uri` resolves to nothing.
   */
  user?: unknown;
  size?: number;
  /** Optional ring drawn by a wrapper View (never as a border on the native image). */
  ringColor?: string;
  ringWidth?: number;
  style?: StyleProp<ImageStyle>;
};

/** Border keys must not reach expo-image: on iOS they change how the image layer is masked. */
const BORDER_KEYS = new Set([
  'borderWidth',
  'borderColor',
  'borderTopWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRightWidth',
  'borderStartWidth',
  'borderEndWidth',
  'borderTopColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
  'borderStartColor',
  'borderEndColor',
  'borderStyle',
]);
const OUTER_KEYS = new Set([
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginStart',
  'marginEnd',
  'marginHorizontal',
  'marginVertical',
  'position',
  'top',
  'bottom',
  'left',
  'right',
  'zIndex',
  'alignSelf',
  'transform',
  'opacity',
]);

/**
 * Profile photo with a local Grow! default — never a broken empty circle.
 * Cached on disk so lists stay instant. A failed remote load falls back to the default.
 */
export default function GrowAvatar({
  userId,
  username,
  uri,
  user,
  size = 40,
  ringColor,
  ringWidth,
  style,
}: Props) {
  const resolved = useMemo(() => resolveAvatarUrl(uri) || resolveAvatarUrl(user), [uri, user]);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  useEffect(() => {
    if (failedUri && failedUri !== resolved) setFailedUri(null);
  }, [resolved, failedUri]);

  const source = useMemo(
    () => avatarSource(resolved && resolved !== failedUri ? resolved : ''),
    [resolved, failedUri]
  );
  const hasRemote = typeof source !== 'number';
  const key = hasRemote ? source.uri : `default:${userId || username || ''}`;

  // Border styles never reach expo-image: the ring is drawn by a wrapper View
  // (inside the same footprint) and margins/position move to that wrapper.
  const flat = (StyleSheet.flatten(style) || {}) as Record<string, unknown>;
  let borderWidth = ringWidth ?? (typeof flat.borderWidth === 'number' ? flat.borderWidth : 0);
  const borderColor = ringColor || (typeof flat.borderColor === 'string' ? flat.borderColor : undefined);
  if (ringColor && ringWidth === undefined && borderWidth === 0) borderWidth = 2;
  const hasRing = borderWidth > 0;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    if (BORDER_KEYS.has(k)) continue;
    if (hasRing && OUTER_KEYS.has(k)) outer[k] = v;
    else inner[k] = v;
  }
  const imageSize = hasRing ? Math.max(1, size - borderWidth * 2) : size;

  const image = (
    <Image
      source={source}
      style={[
        {
          width: imageSize,
          height: imageSize,
          borderRadius: imageSize / 2,
          backgroundColor: theme.colors.raised,
        },
        inner as ImageStyle,
      ]}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={key}
      placeholder={DEFAULT_AVATAR_ASSET}
      placeholderContentFit="cover"
      transition={80}
      onError={() => {
        if (hasRemote) setFailedUri(source.uri);
      }}
      accessibilityIgnoresInvertColors
    />
  );

  if (!hasRing) return image;

  const ring: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth,
    borderColor: borderColor || '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };
  return <View style={[ring, outer as ViewStyle]}>{image}</View>;
}
