import React, { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { feedback } from '../../utils/interactionFeedback';
import { toast } from '../../state/useToastStore';
import { useAuth } from '../../store/hooks';
import { useSavedProducts } from './useSavedProducts';

type Props = {
  productId: string;
  /** Owner of the product — sellers don't see a heart on their own items. */
  ownerId?: string | null;
  size?: number;
  /** `overlay` = round chip for image corners; `plain` = bare icon (headers). */
  variant?: 'overlay' | 'plain';
  style?: StyleProp<ViewStyle>;
};

/** Save / unsave a product with an optimistic heart. Hidden when saves aren't available. */
export default function SaveHeart({ productId, ownerId, size = 18, variant = 'overlay', style }: Props) {
  const { user } = useAuth();
  const saved = useSavedProducts((s) => !!s.ids[productId]);
  const available = useSavedProducts((s) => s.available);
  const load = useSavedProducts((s) => s.load);
  const toggle = useSavedProducts((s) => s.toggle);

  useEffect(() => {
    void load(user?.id);
  }, [load, user?.id]);

  if (!available || !user?.id || (ownerId && ownerId === user.id)) return null;

  const onPress = async () => {
    feedback.like(!saved);
    const next = await toggle(productId);
    if (next === true) toast.success('Saved', { icon: 'heart' });
  };

  const color = saved ? theme.colors.danger : variant === 'overlay' ? theme.colors.ink2 : theme.colors.ink;
  return (
    <PressableScale
      onPress={() => void onPress()}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Remove from saved' : 'Save product'}
      accessibilityState={{ selected: saved }}
      style={[
        variant === 'overlay'
          ? tw`w-8 h-8 rounded-full bg-card/90 items-center justify-center border border-line/60`
          : tw`p-1`,
        style,
      ]}
    >
      <Ionicons name={saved ? 'heart' : 'heart-outline'} size={size} color={color} />
    </PressableScale>
  );
}
