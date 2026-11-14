import React from 'react';
import { View, Text, Animated, AccessibilityInfo } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import Screen from '../../components/ui/Screen';
import PrimaryButton from '../../components/ui/PrimaryButton';
import GrowthAreasPicker, { clampGrowthPaths } from '../../components/profile/GrowthAreasPicker';
import { useAuth } from '../../store/hooks';
import { updateProfileOnServer } from '../../services/api/profile';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import { alertMessage } from '../../utils/confirmDialog';
import tw from '../../lib/tw';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type CategoryPickScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Categories'>;

interface CategoryPickScreenProps {
  navigation: CategoryPickScreenNavigationProp;
}

export default function CategoryPickScreen({ navigation }: CategoryPickScreenProps) {
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const { setOnboardingComplete, refreshProfile } = useAuth();
  const reducedMotion = useReducedMotion();
  // Header, path picker, CTA: staggered rise-in on mount (opacity only with Reduce Motion).
  const groups = React.useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const [entranceStatic, setEntranceStatic] = React.useState(false);

  React.useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    const run = (reduced: boolean) => {
      if (cancelled) return;
      setEntranceStatic(reduced);
      anim = reduced
        ? Animated.parallel(
            groups.map((v) => Animated.timing(v, { toValue: 1, duration: 150, useNativeDriver: true }))
          )
        : Animated.stagger(
            70,
            groups.map((v) =>
              Animated.spring(v, {
                toValue: 1,
                damping: 18,
                stiffness: 180,
                mass: 1,
                useNativeDriver: true,
              })
            )
          );
      anim.start();
    };
    // Read the setting directly so the first frame uses the right motion.
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => run(!!r))
      .catch(() => run(false));
    return () => {
      cancelled = true;
      anim?.stop();
    };
  }, [groups]);

  const groupStyle = (v: Animated.Value) => ({
    opacity: v,
    transform: [
      {
        translateY: v.interpolate({
          inputRange: [0, 1],
          outputRange: entranceStatic || reducedMotion ? [0, 0] : [14, 0],
        }),
      },
    ],
  });

  const handleContinue = async () => {
    if (selectedCategories.length === 0) {
      alertMessage('Pick one to start', 'Choose at least one thing you want to grow in.');
      return;
    }
    setSaving(true);
    try {
      const categories = clampGrowthPaths(selectedCategories);
      // Persist paths first; cohort friend linking continues in the background on the server.
      await updateProfileOnServer({ categories });
      setOnboardingComplete(categories);
      // Don't block leaving the screen if profile refresh is slow.
      void refreshProfile();
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Individual' }],
        })
      );
    } catch (err) {
      const msg =
        err instanceof Error && err.message.trim()
          ? err.message
          : 'Could not save categories on the server.';
      alertMessage('Could not save', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen background="page" edges={['top', 'bottom']}>
      <View style={tw`px-gutter-wide pt-4 pb-6 flex-1 max-w-md w-full self-center`}>
        <Animated.View style={[tw`mb-4`, groupStyle(groups[0])]}>
          <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase`}>
            Grow!
          </Text>
          <Text style={tw`text-3xl font-bold text-ink mt-1.5`}>Choose your paths</Text>
          <Text style={tw`text-ink-3 text-base leading-6 mt-2`}>
            Pick up to 3 things you want to grow in. You can change them anytime.
          </Text>
        </Animated.View>

        <Animated.View style={[tw`flex-1 mb-4`, groupStyle(groups[1])]}>
          <GrowthAreasPicker value={selectedCategories} onChange={setSelectedCategories} />
        </Animated.View>

        <Animated.View style={groupStyle(groups[2])}>
          <PrimaryButton
            label="Continue to Grow!"
            accessibilityLabel={saving ? 'Saving your paths' : 'Continue to Grow!'}
            onPress={handleContinue}
            disabled={selectedCategories.length === 0 || saving}
            loading={saving}
          />
        </Animated.View>
      </View>
    </Screen>
  );
}
