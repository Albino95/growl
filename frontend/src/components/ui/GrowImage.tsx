import React, { forwardRef } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { StyleSheet } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/** Cream placeholder shown while a content image loads. */
export const GROW_IMAGE_PLACEHOLDER = '#EAE4D6';

function uriOf(source: ImageProps['source']): string | undefined {
  if (!source) return undefined;
  if (typeof source === 'string') return source;
  if (Array.isArray(source)) return uriOf(source[0] as ImageProps['source']);
  if (typeof source === 'object' && 'uri' in source && typeof source.uri === 'string') {
    return source.uri;
  }
  return undefined;
}

/**
 * expo-image with Grow defaults for content (photos, posts, products, avatars in
 * lists): a short 150ms fade (none under Reduce Motion), memory+disk cache, a
 * cream placeholder background, and a recyclingKey from the uri so recycled list
 * cells don't flash the previous image. Every prop passes through and wins.
 *
 * Not for icons/logos — use expo-image directly there.
 */
const GrowImage = forwardRef<Image, ImageProps>(function GrowImage(props, ref) {
  const reduced = useReducedMotion();
  const { style, source, ...rest } = props;
  return (
    <Image
      ref={ref}
      source={source}
      transition={reduced ? 0 : 150}
      cachePolicy="memory-disk"
      recyclingKey={uriOf(source)}
      {...rest}
      style={[styles.placeholder, style]}
    />
  );
});

const styles = StyleSheet.create({
  placeholder: { backgroundColor: GROW_IMAGE_PLACEHOLDER },
});

export default GrowImage;
