import React, { memo, useCallback } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../lib/tw';
import { triggerFeedback } from '../../../utils/interactionFeedback';

/** Media editors may hold a video/camera audio session: haptics only, no tap tones. */
const SILENT = { sound: false } as const;

export type EditorToolTab<T extends string = string> = {
  id: T;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export type EditorToolTabsProps<T extends string> = {
  /** Keep this array stable (module constant or useMemo). */
  tabs: readonly EditorToolTab<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Ignore touches (e.g. while the editor is busy or still preparing). */
  disabled?: boolean;
  /** Visually dim the bar (e.g. while media is preparing). */
  dimmed?: boolean;
  style?: StyleProp<ViewStyle>;
};

type TabButtonProps = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
};

const TabButton = memo(function TabButton({
  id,
  label,
  icon,
  selected,
  disabled,
  onSelect,
}: TabButtonProps) {
  return (
    <Pressable
      onPress={() => onSelect(id)}
      disabled={disabled}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      aria-selected={selected}
      style={tw`flex-1 items-center py-2.5 border-b-2 ${
        selected ? 'border-brand-500' : 'border-transparent'
      }`}
    >
      <Ionicons name={icon} size={18} color={selected ? '#34D399' : '#78716C'} />
      <Text
        style={tw`text-[11px] mt-0.5 ${selected ? 'text-brand-400 font-semibold' : 'text-stone-400'}`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
});

/** One tab bar for every media editor: icon + label, underline when selected. */
function EditorToolTabsBase<T extends string>({
  tabs,
  value,
  onChange,
  disabled = false,
  dimmed = false,
  style,
}: EditorToolTabsProps<T>) {
  const onSelect = useCallback(
    (id: string) => {
      if (id === value) return;
      triggerFeedback('tab', SILENT);
      onChange(id as T);
    },
    [onChange, value]
  );

  return (
    <View
      accessibilityRole="tablist"
      pointerEvents={disabled ? 'none' : 'auto'}
      style={[
        tw`flex-row border-b border-stone-800 bg-stone-900`,
        dimmed ? { opacity: 0.5 } : null,
        style,
      ]}
    >
      {tabs.map((t) => (
        <TabButton
          key={t.id}
          id={t.id}
          label={t.label}
          icon={t.icon}
          selected={t.id === value}
          disabled={disabled}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

export const EditorToolTabs = memo(EditorToolTabsBase) as typeof EditorToolTabsBase;
export default EditorToolTabs;
