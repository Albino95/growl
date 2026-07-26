import React from 'react';
import { View, Text } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import Screen from '../../components/ui/Screen';
import PrimaryButton from '../../components/ui/PrimaryButton';
import GrowthAreasPicker, { clampGrowthPaths } from '../../components/profile/GrowthAreasPicker';
import { useAuth } from '../../store/hooks';
import { updateProfileOnServer } from '../../services/api/profile';
import { syncCohortFriends } from '../../services/api/friends';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import { alertMessage } from '../../utils/confirmDialog';
import tw from '../../lib/tw';

type CategoryPickScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Categories'>;

interface CategoryPickScreenProps {
  navigation: CategoryPickScreenNavigationProp;
}

export default function CategoryPickScreen({ navigation }: CategoryPickScreenProps) {
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>([]);
  const { setOnboardingComplete, refreshProfile } = useAuth();

  const handleContinue = async () => {
    if (selectedCategories.length === 0) {
      alertMessage('Select at least one', 'Pick a growth path to continue.');
      return;
    }
    try {
      await updateProfileOnServer({ categories: clampGrowthPaths(selectedCategories) });
      await syncCohortFriends();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save categories on the server.';
      alertMessage('Could not save', msg);
      return;
    }
    setOnboardingComplete(selectedCategories);
    await refreshProfile();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Individual' }],
      })
    );
  };

  return (
    <Screen background="page" edges={['top', 'bottom']}>
      <View style={tw`px-5 pt-4 pb-6 flex-1 max-w-md w-full self-center`}>
        <View style={tw`mb-4`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
            Grow!
          </Text>
          <Text style={tw`text-3xl font-bold text-stone-900 mt-1.5`}>Choose your paths</Text>
          <Text style={tw`text-stone-500 text-base leading-6 mt-2`}>
            Pick up to 3 growth areas. This shapes your feed, shop ranking, and who can endorse you.
          </Text>
        </View>

        <View style={tw`flex-1 mb-4`}>
          <GrowthAreasPicker value={selectedCategories} onChange={setSelectedCategories} />
        </View>

        <PrimaryButton
          label="Continue to Grow!"
          onPress={handleContinue}
          disabled={selectedCategories.length === 0}
        />
      </View>
    </Screen>
  );
}
