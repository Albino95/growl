import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

type CO2Data = {
  emitted: number; // kg CO2
  saved: number; // kg CO2 saved
  category?: string;
};

// Calculate CO2 based on category and activity type
export function calculateCO2(category: string, activityType: 'post' | 'story' | 'reel'): CO2Data {
  // Base emissions for digital activity (very low)
  const baseEmission = 0.001; // ~1g CO2 per post
  
  // Savings from using our platform vs traditional methods
  const savingsByCategory: Record<string, number> = {
    'sustainability': 0.5, // Promoting sustainable practices saves more
    'fitness': 0.1, // Home workouts vs gym commute
    'nutrition': 0.2, // Local sourcing, meal planning
    'mindset': 0.05, // Digital meditation vs travel
    'art': 0.15, // Digital art vs physical materials
    'discipline': 0.1, // Remote productivity
    'martial-arts': 0.1,
    'language': 0.05, // Online learning vs travel
    'coding': 0.2, // Remote work benefits
    'wellness': 0.1,
    'finance': 0.05,
  };

  const saved = savingsByCategory[category] || 0.05;
  
  return {
    emitted: baseEmission * (activityType === 'reel' ? 2 : activityType === 'story' ? 1.5 : 1),
    saved: saved,
    category,
  };
}

export default function CO2Calculator({ category, activityType = 'post' }: { 
  category: string; 
  activityType?: 'post' | 'story' | 'reel';
}) {
  const co2Data = calculateCO2(category, activityType);
  const netImpact = co2Data.saved - co2Data.emitted;
  const isPositive = netImpact > 0;

  return (
    <View style={tw`bg-green-50 border border-green-200 rounded-lg p-3 mt-2`}>
      <View style={tw`flex-row items-center mb-2`}>
        <Ionicons name="leaf" size={16} color="#10B981" />
        <Text style={tw`text-xs font-semibold text-green-800 ml-1`}>Carbon Impact</Text>
      </View>
      <View style={tw`flex-row items-center justify-between`}>
        <View>
          <Text style={tw`text-xs text-gray-600`}>Emitted</Text>
          <Text style={tw`text-sm font-semibold text-gray-900`}>
            {co2Data.emitted.toFixed(3)} kg CO₂
          </Text>
        </View>
        <View style={tw`items-center`}>
          <Text style={tw`text-xs text-gray-600`}>Saved</Text>
          <Text style={tw`text-sm font-semibold text-green-700`}>
            {co2Data.saved.toFixed(3)} kg CO₂
          </Text>
        </View>
        <View style={tw`items-end`}>
          <Text style={tw`text-xs text-gray-600`}>Net Impact</Text>
          <View style={tw`flex-row items-center`}>
            <Ionicons 
              name={isPositive ? 'arrow-down' : 'arrow-up'} 
              size={14} 
              color={isPositive ? '#10B981' : '#EF4444'} 
            />
            <Text style={tw`text-sm font-bold ${
              isPositive ? 'text-green-700' : 'text-red-700'
            }`}>
              {Math.abs(netImpact).toFixed(3)} kg CO₂
            </Text>
          </View>
        </View>
      </View>
      {isPositive && (
        <Text style={tw`text-xs text-green-700 mt-2`}>
          🌱 This activity saved {co2Data.saved.toFixed(3)} kg CO₂ by using sustainable alternatives!
        </Text>
      )}
    </View>
  );
}

