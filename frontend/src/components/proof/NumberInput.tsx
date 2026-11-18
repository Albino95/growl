import React, { forwardRef } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { haptic } from '../../theme/haptics';

type Props = {
  value: string;
  onChangeValue: (v: string) => void;
  unit: string | null;
  onChangeUnit: (u: string) => void;
  units: string[];
  onFocus?: () => void;
  editable?: boolean;
};

/** A number + unit chips (reps, km, min, pages, € … per path). */
const NumberInput = forwardRef<TextInput, Props>(function NumberInput(
  { value, onChangeValue, unit, onChangeUnit, units, onFocus, editable = true },
  ref
) {
  return (
    // self-stretch + min-w-0 keep the big field inside the sheet's padding:
    // a text input's intrinsic width (esp. on web at 32px type) would
    // otherwise push the row past the right edge.
    <View style={tw`self-stretch w-full min-w-0`}>
      <View style={tw`flex-row items-center w-full min-w-0`}>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={(t) => onChangeValue(t.replace(/[^0-9.,-]/g, '').slice(0, 12))}
          onFocus={onFocus}
          keyboardType="decimal-pad"
          returnKeyType="done"
          placeholder="0"
          placeholderTextColor={theme.colors.placeholder}
          editable={editable}
          accessibilityLabel={`Amount${unit ? ` in ${unit}` : ''}`}
          style={[
            tw`flex-1 px-4 py-3 rounded-control bg-card border border-line text-[32px] font-bold text-ink`,
            { fontVariant: ['tabular-nums'], minWidth: 0, width: 0, flexShrink: 1 },
          ]}
        />
        {unit ? (
          <Text style={tw`text-title font-semibold text-ink-2 ml-3 shrink-0`} numberOfLines={1}>
            {unit}
          </Text>
        ) : null}
      </View>
      {units.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={tw`gap-2 mt-3`}
        >
          {units.map((u) => {
            const selected = u === unit;
            return (
              <PressableScale
                key={u}
                onPress={() => {
                  haptic('selection');
                  onChangeUnit(u);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Unit ${u}`}
                style={tw`px-3.5 py-1.5 rounded-chip ${selected ? 'bg-emerald-600' : 'bg-raised'}`}
              >
                <Text style={tw`text-footnote font-semibold ${selected ? 'text-white' : 'text-ink-2'}`}>{u}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
});

export default NumberInput;
