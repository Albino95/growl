import React from 'react';
import { View, Text } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import Screen from '../../components/ui/Screen';
import PrimaryButton from '../../components/ui/PrimaryButton';
import GrowthAreasPicker from '../../components/profile/GrowthAreasPicker';
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
      alertMessage('Select at least one', 'Pick a growth area to continue.');
      return;
    }
    try {
      await updateProfileOnServer({ categories: selectedCategories });
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
        <View style={tw`mb-5 overflow-hidden rounded-3xl bg-brand-700 px-5 pt-8 pb-6`}>
          <Text style={tw`text-brand-100 text-xs font-semibold tracking-widest uppercase mb-2`}>
            Almost there
          </Text>
          <Text style={tw`text-3xl font-bold text-white mb-2`}>Choose your growth areas</Text>
          <Text style={tw`text-brand-100 text-base leading-6`}>
            Pick up to 3 paths. This personalizes your feed and who can endorse you as an instructor.
          </Text>
        </View>

        <View style={tw`flex-1 mb-4`}>
          <GrowthAreasPicker value={selectedCategories} onChange={setSelectedCategories} />
        </View>

        <PrimaryButton
          label="Continue to Growl"
          onPress={handleContinue}
          disabled={selectedCategories.length === 0}
        />
      </View>
    </Screen>
  );
}
