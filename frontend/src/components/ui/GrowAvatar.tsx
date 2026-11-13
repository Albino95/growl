import React, { useMemo } from 'react';
import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';
import { theme } from '../../lib/tw';
import { DEFAULT_AVATAR_ASSET, avatarSource, resolveAvatarUri } from '../../utils/images';

type Props = {
  userId?: string;
  username?: string;
  uri?: string | null;
  size?: number;
  style?: StyleProp<ImageStyle>;
};

/**
 * Profile photo with a local Grow! default — never a broken empty circle.
 * Cached on disk so lists stay instant.
 */
export default function GrowAvatar({ userId, username, uri, size = 40, style }: Props) {
  const source = useMemo(
    () => avatarSource(resolveAvatarUri(userId || username || 'user', username, uri)),
    [userId, username, uri]
  );
  const hasRemote = typeof source !== 'number';
  const key = hasRemote ? source.uri : 'default';

  return (
    <Image
      source={source}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.raised }, style]}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={key}
      placeholder={hasRemote ? undefined : DEFAULT_AVATAR_ASSET}
      transition={80}
    />
  );
}
