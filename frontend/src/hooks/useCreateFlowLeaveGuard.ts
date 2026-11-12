import { useCallback, useEffect, useRef } from 'react';
import { usePreventRemove, type NavigationAction } from '@react-navigation/native';
import { alertMessage, confirmAsync } from '../utils/confirmDialog';

type Navigation = {
  dispatch: (action: NavigationAction) => void;
  isFocused: () => boolean;
};

type Options = {
  navigation: Navigation;
  /** Something the user would lose by leaving (picked media, caption, edits). */
  hasDraft: boolean;
  /** Upload / publish in flight — leaving now would orphan the request. */
  busy?: boolean;
  /** A full-screen editor is showing; back should close it, not the screen. */
  editorOpen?: boolean;
  onCloseEditor?: () => void;
  /** Runs right before leaving after the user confirms the discard. */
  onDiscard?: () => void;
  discardTitle?: string;
  discardMessage?: string;
};

/**
 * Hardware back / swipe-back guard for create flows (post, reel, story).
 * - editor open → close the editor instead of leaving
 * - publishing → stay and explain
 * - unsaved draft → "Discard draft?" confirmation
 *
 * Call `leave(fn)` for programmatic exits that are already confirmed (header
 * close after its own dialog, after publish success) so they skip the guard.
 */
export function useCreateFlowLeaveGuard({
  navigation,
  hasDraft,
  busy = false,
  editorOpen = false,
  onCloseEditor,
  onDiscard,
  discardTitle = 'Discard draft?',
  discardMessage = 'Your draft will be lost.',
}: Options) {
  const bypassRef = useRef(false);
  const mountedRef = useRef(true);
  const promptingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  usePreventRemove(hasDraft || busy || editorOpen, ({ data }) => {
    if (bypassRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (editorOpen && onCloseEditor) {
      onCloseEditor();
      return;
    }
    if (busy) {
      void alertMessage(
        'Still publishing',
        'Hang on until it finishes so nothing gets lost.'
      );
      return;
    }
    if (promptingRef.current) return;
    promptingRef.current = true;
    void confirmAsync(discardTitle, discardMessage, {
      confirmLabel: 'Discard',
      destructive: true,
    })
      .then((ok) => {
        if (!ok || !mountedRef.current) return;
        bypassRef.current = true;
        onDiscard?.();
        navigation.dispatch(data.action);
      })
      .finally(() => {
        promptingRef.current = false;
      });
  });

  /** Run a navigation that must not be intercepted (already confirmed). */
  const leave = useCallback((go: () => void) => {
    bypassRef.current = true;
    go();
  }, []);

  /** True while the screen is mounted and on top — safe to auto-navigate. */
  const canAutoLeave = useCallback(
    () => mountedRef.current && navigation.isFocused(),
    [navigation]
  );

  return { leave, canAutoLeave, mountedRef };
}
