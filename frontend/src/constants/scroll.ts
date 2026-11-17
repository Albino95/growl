import type { ScrollViewProps } from 'react-native';
import { Platform } from 'react-native';

/** Shared props for horizontal strip scrollers (stories, chips, tabs). */
export const horizontalScrollProps: Pick<
  ScrollViewProps,
  'showsHorizontalScrollIndicator' | 'scrollEventThrottle' | 'decelerationRate' | 'keyboardShouldPersistTaps'
> = {
  showsHorizontalScrollIndicator: false,
  scrollEventThrottle: 16,
  decelerationRate: 'fast',
  keyboardShouldPersistTaps: 'handled',
};

/** Vertical lists / feeds — smoother tracking without over-scrolling on Android. */
export const verticalScrollProps: Pick<
  ScrollViewProps,
  'scrollEventThrottle' | 'keyboardShouldPersistTaps' | 'keyboardDismissMode'
> = {
  scrollEventThrottle: 16,
  keyboardShouldPersistTaps: 'handled',
  keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
};

/** Default FlatList tuning for image-heavy feeds. */
export const feedListPerformanceProps = {
  initialNumToRender: 4,
  maxToRenderPerBatch: 3,
  windowSize: 5,
  updateCellsBatchingPeriod: 50,
  removeClippedSubviews: Platform.OS === 'android',
} as const;

/** Shared bottom padding so tab-screen content clears the floating dock. */
export const TAB_SCREEN_BOTTOM_PADDING = Platform.OS === 'ios' ? 118 : 108;
