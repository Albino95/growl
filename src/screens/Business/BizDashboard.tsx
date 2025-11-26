import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../../components/ui/Card';
import tw from '../../lib/tw';

export default function BizDashboard() {
  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`p-6 gap-4`}>
        <Text style={tw`text-2xl font-bold`}>Business Dashboard</Text>
        <Card title="KPIs" subtitle="This week">
          <Text style={tw`text-gray-700 mt-2`}>Revenue, orders, conversion, etc.</Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}
