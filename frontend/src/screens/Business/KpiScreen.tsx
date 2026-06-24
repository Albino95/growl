import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { getDashboard, getBusinessTopProducts, type DashboardKPIs } from '../../services/api/business';
import { verticalScrollProps } from '../../constants/scroll';
import { startOfBusinessPeriod, bucketOrdersByDay } from '../../utils/businessMetrics';

export default function KpiScreen() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [topProducts, setTopProducts] = useState<Array<{ id: string; name: string; units_sold: number; revenue: number }>>([]);

  const load = useCallback(async (selected: 'today' | 'week' | 'month') => {
    try {
      setLoading(true);
      setLoadError(null);
      const [res, top] = await Promise.all([getDashboard(selected), getBusinessTopProducts(selected)]);
      if (res.success && res.data?.kpis) {
        setKpis(res.data.kpis);
      }
      if (top.success && top.data?.products) {
        setTopProducts(top.data.products);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load analytics';
      setLoadError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  const orders = kpis?.recent_orders ?? [];
  const filteredOrders = useMemo(() => {
    const t0 = startOfBusinessPeriod(period);
    return orders.filter((o) => new Date(o.created_at).getTime() >= t0);
  }, [orders, period]);

  const orderBars = useMemo(() => bucketOrdersByDay(orders, 7), [orders]);
  const maxBar = Math.max(1, ...orderBars.map((b) => b.count));

  const revenueInPeriod = useMemo(
    () => filteredOrders.reduce((s, o) => s + Number(o.total || 0), 0),
    [filteredOrders]
  );

  const monetizationLevers = useMemo(
    () => [
      {
        title: 'Raise basket size',
        body: 'Bundle complementary SKUs and surface them after checkout intent in the marketplace.',
        icon: 'cart' as const,
      },
      {
        title: 'Convert feed attention',
        body: 'Tie category-based posts to your SKUs — sponsored placements become high-intent traffic.',
        icon: 'megaphone' as const,
      },
      {
        title: 'Instructor-led demand',
        body: 'Partnerships turn trusted voices into recurring cohorts that rebuy consumables on-platform.',
        icon: 'people' as const,
      },
    ],
    []
  );

  if (loading && !kpis) {
    return (
      <SafeAreaView style={tw`flex-1 bg-stone-50 items-center justify-center`} edges={['bottom']}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={tw`text-stone-500 mt-3`}>Loading analytics…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['bottom']}>
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`px-4 pt-2 pb-10`}
        {...verticalScrollProps}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(period);
            }}
            tintColor="#059669"
            colors={['#059669']}
          />
        }
      >
        <Text style={tw`text-sm text-stone-500 mb-3`}>
          Signals from your live dashboard — use this view to prioritize revenue experiments.
        </Text>
        {loadError ? (
          <View style={tw`mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200`}>
            <Text style={tw`text-sm text-red-700`}>{loadError}</Text>
          </View>
        ) : null}

        <View style={tw`flex-row bg-stone-200/80 rounded-xl p-1 mb-4`}>
          {(['today', 'week', 'month'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => setPeriod(p)}
              style={tw`flex-1 py-2 rounded-lg ${period === p ? 'bg-white shadow-sm' : ''}`}
            >
              <Text
                style={tw`text-center text-sm font-semibold ${
                  period === p ? 'text-emerald-700' : 'text-stone-500'
                }`}
              >
                {p === 'today' ? 'Today' : p === 'week' ? '7 days' : '30 days'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={tw`flex-row flex-wrap -mx-2 mb-4`}>
          <View style={tw`w-1/2 px-2 mb-3`}>
            <View style={tw`bg-white rounded-2xl p-4 border border-stone-100`}>
              <Text style={tw`text-xs text-stone-500 mb-1`}>Orders ({period})</Text>
              <Text style={tw`text-2xl font-bold text-stone-900`}>{filteredOrders.length}</Text>
            </View>
          </View>
          <View style={tw`w-1/2 px-2 mb-3`}>
            <View style={tw`bg-white rounded-2xl p-4 border border-stone-100`}>
              <Text style={tw`text-xs text-stone-500 mb-1`}>Revenue ({period})</Text>
              <Text style={tw`text-2xl font-bold text-emerald-700`}>
                ${revenueInPeriod.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        <View style={tw`bg-white rounded-2xl p-4 mb-4 border border-stone-100`}>
          <Text style={tw`text-base font-bold text-stone-900 mb-1`}>Order volume (last 7 days)</Text>
          <Text style={tw`text-xs text-stone-500 mb-4`}>Based on recent orders returned from your dashboard API</Text>
          <View style={tw`flex-row items-end justify-between h-36 px-1`}>
            {orderBars.map((b) => {
              const h = Math.max(6, Math.round((b.count / maxBar) * 120));
              return (
                <View key={b.label} style={tw`flex-1 items-center mx-0.5`}>
                  <View style={[tw`w-full rounded-t-md bg-emerald-500`, { height: h }]} />
                  <Text style={tw`text-[10px] text-stone-400 mt-2`} numberOfLines={1}>
                    {b.label}
                  </Text>
                  <Text style={tw`text-xs font-semibold text-stone-700`}>{b.count}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {kpis ? (
          <View style={tw`bg-white rounded-2xl p-4 mb-4 border border-stone-100`}>
            <Text style={tw`text-base font-bold text-stone-900 mb-3`}>Store snapshot</Text>
            <View style={tw`flex-row flex-wrap`}>
              <View style={tw`w-1/2 mb-3`}>
                <Text style={tw`text-xs text-stone-500`}>Catalog</Text>
                <Text style={tw`text-lg font-semibold text-stone-900`}>{kpis.total_products} products</Text>
              </View>
              <View style={tw`w-1/2 mb-3`}>
                <Text style={tw`text-xs text-stone-500`}>Stock units</Text>
                <Text style={tw`text-lg font-semibold text-stone-900`}>{kpis.total_stock ?? 0}</Text>
              </View>
              <View style={tw`w-1/2 mb-3`}>
                <Text style={tw`text-xs text-stone-500`}>Pending orders</Text>
                <Text style={tw`text-lg font-semibold text-amber-700`}>{kpis.pending_orders}</Text>
              </View>
              <View style={tw`w-1/2 mb-3`}>
                <Text style={tw`text-xs text-stone-500`}>Lifetime revenue</Text>
                <Text style={tw`text-lg font-semibold text-emerald-700`}>
                  ${kpis.total_revenue.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {topProducts.length > 0 ? (
          <View style={tw`bg-white rounded-2xl p-4 mb-4 border border-stone-100`}>
            <Text style={tw`text-base font-bold text-stone-900 mb-3`}>Top products ({period})</Text>
            {topProducts.map((p) => (
              <View key={p.id} style={tw`flex-row items-center justify-between py-2 border-b border-stone-100 last:border-b-0`}>
                <View style={tw`flex-1 pr-2`}>
                  <Text style={tw`text-sm font-medium text-stone-900`} numberOfLines={1}>{p.name}</Text>
                  <Text style={tw`text-xs text-stone-500`}>{p.units_sold} units sold</Text>
                </View>
                <Text style={tw`text-sm font-semibold text-emerald-700`}>${Number(p.revenue).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={tw`text-lg font-bold text-stone-900 mb-2`}>Monetization levers</Text>
        <Text style={tw`text-sm text-stone-500 mb-3`}>
          Actions that compound GMV and take-rate as the marketplace matures.
        </Text>
        {monetizationLevers.map((m) => (
          <View
            key={m.title}
            style={tw`flex-row bg-white rounded-2xl p-4 mb-3 border border-stone-100`}
          >
            <View style={tw`w-11 h-11 rounded-full bg-emerald-50 items-center justify-center mr-3`}>
              <Ionicons name={m.icon} size={22} color="#059669" />
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`font-semibold text-stone-900 mb-1`}>{m.title}</Text>
              <Text style={tw`text-sm text-stone-600 leading-5`}>{m.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
