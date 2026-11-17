import React from 'react';
import { Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';

/**
 * Copy text without new installs: RN core Clipboard on native (deprecated but still
 * shipped in RN 0.81 — expo-clipboard isn't installed), navigator.clipboard on web.
 * Returns false when nothing could be copied.
 */
export async function copyMessageText(text: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through */
    }
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Clipboard } = require('react-native') as {
      Clipboard?: { setString: (s: string) => void };
    };
    if (Clipboard?.setString) {
      Clipboard.setString(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

type Action = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  own: boolean;
  /** `dark` = the chat wall is dark (same rule as ReactionPicker). */
  dark?: boolean;
  onCopy: () => void;
  onUnsend?: () => void;
  onReport?: () => void;
};

/** Small action row shown under the reaction picker on long-press. */
export default function MessageActions({ own, dark, onCopy, onUnsend, onReport }: Props) {
  const actions: Action[] = [{ key: 'copy', label: 'Copy', icon: 'copy-outline', onPress: onCopy }];
  if (own && onUnsend) {
    actions.push({ key: 'unsend', label: 'Unsend', icon: 'arrow-undo-outline', destructive: true, onPress: onUnsend });
  }
  if (!own && onReport) {
    actions.push({ key: 'report', label: 'Report', icon: 'flag-outline', destructive: true, onPress: onReport });
  }
  const ink = dark ? '#F5F1EA' : '#1C1917';
  const danger = dark ? '#FCA5A5' : '#B91C1C';
  return (
    <View
      style={[
        tw`flex-row items-center px-1 py-0.5 rounded-full mb-1.5`,
        {
          backgroundColor: dark ? '#3A3632' : '#FFFcf7',
          borderWidth: 1,
          borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.08)',
        },
      ]}
    >
      {actions.map((a) => {
        const color = a.destructive ? danger : ink;
        return (
          <PressableScale
            key={a.key}
            pressedScale={0.92}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={a.onPress}
            accessibilityRole="button"
            accessibilityLabel={a.key === 'unsend' ? 'Unsend message' : a.key === 'report' ? 'Report message' : 'Copy message'}
            style={tw`flex-row items-center px-3 min-h-[36px]`}
          >
            <Ionicons name={a.icon} size={15} color={color} />
            <Text style={[tw`text-footnote font-semibold ml-1.5`, { color }]}>{a.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
