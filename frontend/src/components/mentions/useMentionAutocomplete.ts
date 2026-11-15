import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type {
  NativeSyntheticEvent,
  TextInput,
  TextInputKeyPressEventData,
  TextInputSelectionChangeEventData,
} from 'react-native';
import { mentionsAvailable, suggestMentions, type MentionSuggestion } from '../../services/api/mentions';
import { activeMentionQuery, insertMention } from '../text/richTextTokens';

const DEBOUNCE_MS = 150;

/**
 * Drives the @mention popover for a controlled TextInput: tracks the cursor,
 * finds the @query being typed, fetches suggestions (debounced 150 ms) and
 * inserts `@username ` on pick. Typing a space or pressing Escape dismisses.
 */
export function useMentionAutocomplete(
  value: string,
  onChangeText: (text: string) => void,
  inputRef?: RefObject<TextInput | null>
) {
  const [cursor, setCursor] = useState<number>(value.length);
  const [items, setItems] = useState<MentionSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  /** '@' index the user dismissed; stays dismissed until a new @ is typed. */
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const reqId = useRef(0);

  const active = mentionsAvailable() ? activeMentionQuery(value, Math.min(cursor, value.length)) : null;
  const open = !!active && active.start !== dismissedAt;
  const query = open ? active!.query : null;

  useEffect(() => {
    if (query === null) {
      reqId.current += 1;
      setItems([]);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(() => {
      void suggestMentions(query).then((list) => {
        if (id !== reqId.current) return;
        setItems(list);
        setLoading(false);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // A new '@' (different position) re-enables suggestions.
  useEffect(() => {
    if (dismissedAt !== null && active?.start !== dismissedAt) setDismissedAt(null);
  }, [active?.start, dismissedAt]);

  const onSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setCursor(e.nativeEvent.selection.end);
    },
    []
  );

  const dismiss = useCallback(() => {
    if (active) setDismissedAt(active.start);
  }, [active]);

  const onKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (e.nativeEvent.key === 'Escape') dismiss();
    },
    [dismiss]
  );

  const pick = useCallback(
    (user: MentionSuggestion) => {
      if (!active) return;
      const next = insertMention(value, active, user.username);
      onChangeText(next.text);
      setCursor(next.cursor);
      const input = inputRef?.current as unknown as { setSelection?: (s: number, e: number) => void } | null;
      requestAnimationFrame(() => input?.setSelection?.(next.cursor, next.cursor));
    },
    [active, value, onChangeText, inputRef]
  );

  return {
    /** Show the popover (results or a loading row). */
    visible: open && (loading || items.length > 0),
    items,
    loading,
    query,
    pick,
    dismiss,
    onSelectionChange,
    onKeyPress,
  };
}
