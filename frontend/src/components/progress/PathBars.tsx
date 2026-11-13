import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { getCategoryMeta } from '../../utils/categoryLabels';
import { pathColor } from './progressMath';

type Props = {
  data: { path: string; count: number }[];
  /** Max rows (default 6). */
  limit?: number;
};

/** Horizontal bars of activity per growth path. */
export default function PathBars({ data, limit = 6 }: Props) {
  const rows = [...data].filter((d) => d.count > 0).sort((a, b) => b.count - a.count).slice(0, limit);
  if (!rows.length) {
    return (
      <Text style={tw`text-xs text-ink-3`}>
        Post or check in on a path and it will show up here.
      </Text>
    );
  }
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <View>
      {rows.map((r) => {
        const meta = getCategoryMeta(r.path);
        const color = pathColor(r.path);
        const label = meta.subLabel ? `${meta.parentLabel} · ${meta.subLabel}` : meta.parentLabel;
        return (
          <View
            key={r.path}
            style={tw`mb-2.5`}
            accessible
            accessibilityLabel={`${label}: ${r.count}`}
          >
            <View style={tw`flex-row items-center mb-1`}>
              <Ionicons name={meta.icon} size={13} color={color} />
              <Text style={tw`text-xs font-semibold text-ink-2 ml-1.5 flex-1`} numberOfLines={1}>
                {label}
              </Text>
              <Text style={tw`text-xs text-ink-3`}>{r.count}</Text>
            </View>
            <View style={tw`h-2.5 bg-raised rounded-full overflow-hidden`}>
              <View
                style={{
                  height: '100%',
                  width: `${Math.max(4, (r.count / max) * 100)}%`,
                  backgroundColor: color,
                  borderRadius: 999,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
