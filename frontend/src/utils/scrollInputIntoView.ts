import type { RefObject } from 'react';
import type { ScrollView, TextInput } from 'react-native';

/**
 * Scroll a ScrollView so `input` sits near the top of its viewport once the
 * keyboard has finished moving. Use from the input's onFocus in scroll views
 * that are *lifted* above the keyboard (bottom sheets padded by
 * useKeyboardInset), where iOS's automatic keyboard scrolling never kicks in
 * because the scroll view itself isn't covered.
 */
export function scrollInputIntoView(
  scrollRef: RefObject<ScrollView | null>,
  inputRef: RefObject<TextInput | null>,
  { delay = 320, topGap = 72 }: { delay?: number; topGap?: number } = {}
) {
  setTimeout(() => {
    const scroll = scrollRef.current;
    const input = inputRef.current;
    if (!scroll || !input) return;
    const inner = (scroll as unknown as { getInnerViewRef?: () => unknown }).getInnerViewRef?.();
    if (!inner) {
      scroll.scrollToEnd({ animated: true });
      return;
    }
    try {
      input.measureLayout(
        inner as never,
        (_x, y) => scroll.scrollTo({ y: Math.max(0, y - topGap), animated: true }),
        () => scroll.scrollToEnd({ animated: true })
      );
    } catch {
      scroll.scrollToEnd({ animated: true });
    }
  }, delay);
}
