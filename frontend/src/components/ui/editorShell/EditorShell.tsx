import React, { memo, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../lib/tw';
import { confirmAsync } from '../../../utils/confirmDialog';
import { feedback } from '../../../utils/interactionFeedback';
import { EditorSavingOverlay } from './EditorSavingOverlay';

export const EDITOR_DISCARD_TITLE = 'Discard your edits?';
export const EDITOR_DISCARD_CONFIRM = 'Discard';
export const EDITOR_DISCARD_CANCEL = 'Keep editing';
export const EDITOR_DONE_LABEL = 'Done';

export type EditorSubtitleTone = 'muted' | 'brand' | 'amber';

export type EditorShellProps = {
  title: string;
  /** Small line under the title (e.g. "Looks apply on Done", clip length). */
  subtitle?: string;
  subtitleTone?: EditorSubtitleTone;
  onTitlePress?: () => void;
  onTitleLongPress?: () => void;

  /** When true, Close / Android back ask "Discard your edits?" first. */
  hasUnsavedChanges: boolean;
  /** Body of the discard confirm. */
  discardMessage?: string;
  /** Called once the user has chosen to leave (after the confirm, if any). */
  onCancel: () => void;
  /** Close / back are ignored (e.g. while a rotate or save is running). */
  closeDisabled?: boolean;

  onDone: () => void;
  doneDisabled?: boolean;
  /** Done shows "Saving…" and a blocking overlay covers the editor. */
  saving?: boolean;
  savingLabel?: string;
  savingDetail?: string;

  /** Optional row between the top bar and the stage (undo / auto / compare). */
  toolbar?: ReactNode;
  /** The preview area. Keep its element tree stable so players don't remount. */
  stage: ReactNode;
  /** Tool tab bar (usually <EditorToolTabs />). */
  tools?: ReactNode;
  /** Active tool panel. */
  children?: ReactNode;
};

const SUBTITLE_TONE: Record<EditorSubtitleTone, string> = {
  muted: 'text-stone-400',
  brand: 'text-brand-400',
  amber: 'text-amber-400',
};

type TopBarProps = {
  title: string;
  subtitle?: string;
  subtitleTone: EditorSubtitleTone;
  closeDisabled: boolean;
  doneDisabled: boolean;
  saving: boolean;
  hasTitleAction: boolean;
  onClose: () => void;
  onDone: () => void;
  onTitlePress: () => void;
  onTitleLongPress: () => void;
};

const EditorTopBar = memo(function EditorTopBar({
  title,
  subtitle,
  subtitleTone,
  closeDisabled,
  doneDisabled,
  saving,
  hasTitleAction,
  onClose,
  onDone,
  onTitlePress,
  onTitleLongPress,
}: TopBarProps) {
  const doneInactive = doneDisabled || saving;
  return (
    <View
      style={[
        tw`flex-row items-center justify-between px-4 border-b border-stone-800`,
        { paddingBottom: 10, paddingTop: 6, zIndex: 30 },
      ]}
    >
      <Pressable
        onPress={onClose}
        disabled={closeDisabled}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Close editor"
        accessibilityState={{ disabled: closeDisabled }}
        style={tw`w-10 h-10 rounded-full bg-white/10 items-center justify-center ${
          closeDisabled ? 'opacity-50' : ''
        }`}
      >
        <Ionicons name="close" size={20} color="#E7E5E4" />
      </Pressable>
      <Pressable
        onPress={hasTitleAction ? onTitlePress : undefined}
        onLongPress={hasTitleAction ? onTitleLongPress : undefined}
        delayLongPress={400}
        disabled={!hasTitleAction}
        accessible={false}
        style={tw`items-center flex-1 px-2`}
      >
        <Text style={tw`text-white text-base font-bold`} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={tw`${SUBTITLE_TONE[subtitleTone]} text-[11px] mt-0.5`} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </Pressable>
      <Pressable
        onPress={onDone}
        disabled={doneInactive}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={saving ? 'Saving edits' : 'Done editing'}
        accessibilityState={{ disabled: doneInactive, busy: saving }}
        style={tw`flex-row items-center px-4 py-2 rounded-full ${
          doneDisabled && !saving ? 'bg-stone-800' : 'bg-brand-600'
        }`}
      >
        {saving ? <ActivityIndicator size="small" color="#FFFFFF" style={tw`mr-1.5`} /> : null}
        <Text style={tw`font-bold text-sm ${doneDisabled && !saving ? 'text-stone-400' : 'text-white'}`}>
          {saving ? 'Saving…' : EDITOR_DONE_LABEL}
        </Text>
      </Pressable>
    </View>
  );
});

/**
 * Shared frame for the photo and video editors: top bar (Close with discard
 * confirm · title · Done with saving state), safe areas, stage, tool tabs,
 * tool panel and a blocking saving overlay. Also owns Android hardware back
 * (closes the editor — with the same confirm — never the screen beneath).
 */
export function EditorShell({
  title,
  subtitle,
  subtitleTone = 'muted',
  onTitlePress,
  onTitleLongPress,
  hasUnsavedChanges,
  discardMessage = 'Your changes will be lost.',
  onCancel,
  closeDisabled = false,
  onDone,
  doneDisabled = false,
  saving = false,
  savingLabel = 'Saving…',
  savingDetail,
  toolbar,
  stage,
  tools,
  children,
}: EditorShellProps) {
  // Latest props in refs so the top bar's callbacks stay referentially stable
  // (the bar is memoized and never re-renders for slider drags etc.).
  const latest = useRef({
    hasUnsavedChanges,
    discardMessage,
    onCancel,
    closeDisabled,
    saving,
    onDone,
    doneDisabled,
    onTitlePress,
    onTitleLongPress,
  });
  latest.current = {
    hasUnsavedChanges,
    discardMessage,
    onCancel,
    closeDisabled,
    saving,
    onDone,
    doneDisabled,
    onTitlePress,
    onTitleLongPress,
  };
  const confirmingRef = useRef(false);

  const requestClose = useCallback(async () => {
    const s = latest.current;
    if (s.closeDisabled || s.saving || confirmingRef.current) return;
    if (s.hasUnsavedChanges) {
      confirmingRef.current = true;
      try {
        const discard = await confirmAsync(EDITOR_DISCARD_TITLE, s.discardMessage, {
          confirmLabel: EDITOR_DISCARD_CONFIRM,
          cancelLabel: EDITOR_DISCARD_CANCEL,
          destructive: true,
        });
        if (!discard) return;
      } finally {
        confirmingRef.current = false;
      }
    }
    feedback.close();
    latest.current.onCancel();
  }, []);

  const onClosePress = useCallback(() => {
    void requestClose();
  }, [requestClose]);

  const onDonePress = useCallback(() => {
    const s = latest.current;
    if (s.doneDisabled || s.saving) return;
    s.onDone();
  }, []);

  const onTitlePressStable = useCallback(() => latest.current.onTitlePress?.(), []);
  const onTitleLongPressStable = useCallback(() => latest.current.onTitleLongPress?.(), []);

  // Android hardware back closes the editor (with the same confirm), never the screen.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      void requestClose();
      return true;
    });
    return () => sub.remove();
  }, [requestClose]);

  return (
    <View style={tw`flex-1 bg-stone-950`}>
      <SafeAreaView style={tw`flex-1 bg-stone-950`} edges={['top', 'bottom']}>
        <EditorTopBar
          title={title}
          subtitle={subtitle}
          subtitleTone={subtitleTone}
          closeDisabled={closeDisabled || saving}
          doneDisabled={doneDisabled}
          saving={saving}
          hasTitleAction={Boolean(onTitlePress || onTitleLongPress)}
          onClose={onClosePress}
          onDone={onDonePress}
          onTitlePress={onTitlePressStable}
          onTitleLongPress={onTitleLongPressStable}
        />
        {toolbar}
        {stage}
        {tools}
        {children}
      </SafeAreaView>
      {saving ? <EditorSavingOverlay label={savingLabel} detail={savingDetail} /> : null}
    </View>
  );
}

export default EditorShell;
