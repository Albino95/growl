import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { useBuddyStore } from '../../state/useBuddyStore';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { buddiesTodaySummary } from './buddyCopy';

/** One quiet line under the Today pill: "2 buddies showed up today" → Buddies. */
function BuddyTodayLine() {
  const navigation = useNavigation<any>();
  const buddies = useBuddyStore((s) => s.data?.buddies);
  const load = useBuddyStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  const line = buddies ? buddiesTodaySummary(buddies) : null;
  if (!line) return null;
  return (
    <PressableScale
      feedback={false}
      onPress={() => navigateFromRoot(navigation, 'Buddies')}
      accessibilityRole="button"
      accessibilityLabel={`${line}. Open buddies`}
      style={tw`mt-1.5 flex-row items-center px-3.5 py-1.5`}
    >
      <Ionicons name="people-outline" size={14} color={theme.colors.leafInk} />
      <Text style={tw`flex-1 ml-1.5 text-xs text-ink-2`} numberOfLines={1}>
        {line}
      </Text>
      <Ionicons name="chevron-forward" size={12} color={theme.colors.iconMuted} />
    </PressableScale>
  );
}

export default React.memo(BuddyTodayLine);
