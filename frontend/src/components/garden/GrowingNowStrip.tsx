import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import FadeInUp from '../ui/FadeInUp';
import LiveHalo from '../circles/LiveHalo';
import SeedPlantVisual from './SeedPlantVisual';
import { listSeeds, type GrowthSeed } from '../../services/api/seeds';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { horizontalScrollProps } from '../../constants/scroll';

type Props = {
  onPlantPress?: () => void;
};

/** Profile strip of active seeds + entry to Garden. */
export default function GrowingNowStrip({ onPlantPress }: Props) {
  const navigation = useNavigation();
  const [seeds, setSeeds] = useState<GrowthSeed[]>([]);
  const [matured, setMatured] = useState(0);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void listSeeds('growing')
        .then((res) => {
          if (cancelled) return;
          setSeeds(res.seeds.filter((s) => s.status === 'growing' || s.status === 'resting'));
          setMatured(res.matured_tree_count);
        })
        .catch(() => {
          if (!cancelled) setSeeds([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <FadeInUp style={tw`mt-3`}>
      <View style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-2xl overflow-hidden`}>
        <View style={tw`h-1 bg-emerald-600`} />
        <View style={tw`px-4 pt-3.5 pb-2 flex-row items-center justify-between`}>
          <View>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
              Growing now
            </Text>
            <Text style={tw`text-lg font-bold text-stone-900 mt-0.5`}>Your seeds</Text>
          </View>
          <View style={tw`flex-row items-center gap-1.5`}>
            <LiveHalo>
              <PressableScale
                onPress={() => navigateFromRoot(navigation, 'Circles')}
                feedback="open"
                style={tw`px-3 py-2 rounded-xl bg-[#FFF1F0] border border-[#FECACA] flex-row items-center`}
              >
                <Ionicons name="people-outline" size={14} color="#E11D48" />
                <Text style={tw`text-xs font-bold text-[#E11D48] ml-1`}>Circles</Text>
              </PressableScale>
            </LiveHalo>
            <PressableScale
              onPress={() => navigateFromRoot(navigation, 'Garden')}
              feedback="open"
              style={tw`px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 flex-row items-center`}
            >
              <Ionicons name="leaf-outline" size={14} color="#059669" />
              <Text style={tw`text-xs font-bold text-emerald-800 ml-1`}>
                Garden{matured > 0 ? ` · ${matured}` : ''}
              </Text>
            </PressableScale>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color="#059669" style={tw`py-8`} />
        ) : seeds.length === 0 ? (
          <View style={tw`px-4 pb-4 pt-1`}>
            <Text style={tw`text-sm text-stone-500 leading-5 mb-3`}>
              Plant a goal from your paths — watch it grow into a tree in your Garden.
            </Text>
            <PressableScale
              onPress={() => {
                if (onPlantPress) onPlantPress();
                else navigateFromRoot(navigation, 'PlantSeed');
              }}
              feedback="open"
              style={tw`py-3 rounded-xl bg-emerald-600 items-center flex-row justify-center gap-2`}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={tw`text-white font-bold text-sm`}>Plant a seed</Text>
            </PressableScale>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={tw`px-4 pb-6 pt-2 gap-4`}
            {...horizontalScrollProps}
          >
            {seeds.map((seed) => (
              <PressableScale
                key={seed.id}
                onPress={() => navigateFromRoot(navigation, 'SeedDetail', { seedId: seed.id })}
                feedback="open"
                style={tw`w-[112px] items-center pt-2`}
              >
                <SeedPlantVisual
                  stage={seed.stage}
                  progress={seed.progress_to_mature}
                  size={72}
                  shared={seed.ownership === 'shared'}
                  resting={seed.status === 'resting'}
                />
                <Text
                  style={tw`text-[12px] font-semibold text-stone-900 mt-6 text-center`}
                  numberOfLines={2}
                >
                  {seed.title}
                </Text>
                <Text style={tw`text-[11px] text-stone-500 mt-0.5`} numberOfLines={1}>
                  {getCategoryLabel(`${seed.category_key}:${seed.subcategory_key}`)}
                </Text>
              </PressableScale>
            ))}
            <PressableScale
              onPress={() => {
                if (onPlantPress) onPlantPress();
                else navigateFromRoot(navigation, 'PlantSeed');
              }}
              feedback="open"
              style={tw`w-[88px] items-center justify-center pt-2`}
            >
              <View
                style={tw`w-[72px] h-[72px] rounded-full border-2 border-dashed border-emerald-300 bg-emerald-50/50 items-center justify-center`}
              >
                <Ionicons name="add" size={28} color="#059669" />
              </View>
              <Text style={tw`text-[12px] font-semibold text-emerald-800 mt-6`}>Plant</Text>
            </PressableScale>
          </ScrollView>
        )}
      </View>
    </FadeInUp>
  );
}
