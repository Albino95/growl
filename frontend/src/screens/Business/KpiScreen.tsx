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
import { verticalScrollProps } from '../../constants/scroll';
import { useBusinessDashboard } from '../../hooks/useBusinessDashboard';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchBusinessGrow } from '../../store/slices/businessSlice';
import PeriodToggle from '../../components/business/PeriodToggle';
import KpiCard from '../../components/business/KpiCard';
import SectionLabel from '../../components/ui/SectionLabel';
import type { OrderFunnel } from '../../services/api/business';

const FUNNEL_STEPS: Array<{ key: keyof OrderFunnel; label: string; color: string }> = [
  { key: 'pending', label: 'Pending', color: '#F59E0B' },
  { key: 'processing', label: 'Processing', color: '#3B82F6' },
  { key: 'shipped', label: 'Shipped', color: '#8B5CF6' },
  { key: 'delivered', label: 'Delivered', color: '#059669' },
  { key: 'completed', label: 'Completed', color: '#047857' },
  { key: 'cancelled', label: 'Cancelled', color: '#EF4444' },
];

export default function KpiScreen() {
  const dispatch = useAppDispatch();
  const {
    period,
    setPeriod,
    kpis,
    timeseries,
    funnel,
    topProducts,
    status,
    error,
    loading,
    refresh,
  } = useBusinessDashboard();

  const partnershipPerformance = useAppSelector((s) => s.business.partnershipPerformance);
  const growStatus = useAppSelector((s) => s.business.growStatus);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (partnershipPerformance.length === 0) {
      void dispatch(fetchBusinessGrow());
    }
  }, [dispatch, partnershipPerformance.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh({ force: true }), dispatch(fetchBusinessGrow()).unwrap()]);
    } catch {
      // errors surface in slice state
    } finally {
      setRefreshing(false);
    }
  }, [refresh, dispatch]);

  const maxSeries = Math.max(1, ...timeseries.map((p) => p.revenue || 0));
  const maxFunnel = Math.max(1, ...(funnel ? Object.values(funnel) : [1]));

  const net = kpis?.net_revenue ?? kpis?.total_revenue ?? 0;
  const gross = kpis?.gross_revenue ?? kpis?.total_revenue ?? 0;
  const refunds = kpis?.refunds ?? 0;
  const refundRate = kpis?.refund_rate ?? 0;
  const aov = kpis?.aov ?? 0;
  const unitsSold = kpis?.units_sold ?? 0;

  const showBasketTip = aov > 0 && aov < 25;

  const sortedPartners = useMemo(
    () => [...partnershipPerformance].sort((a, b) => b.attributed_revenue - a.attributed_revenue),
    [partnershipPerformance]
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
        contentContainerStyle={tw`px-4 pt-3 pb-10`}
        {...verticalScrollProps}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#059669"
            colors={['#059669']}
          />
        }
      >
        {error ? (
          <View style={tw`mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200`}>
            <Text style={tw`text-sm text-red-700 mb-2`}>{error}</Text>
            <TouchableOpacity onPress={() => void refresh({ force: true })}>
              <Text style={tw`text-sm font-semibold text-red-800`}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={tw`mb-4`}>
          <PeriodToggle value={period} onChange={setPeriod} />
        </View>

        {showBasketTip ? (
          <View style={tw`flex-row bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4`}>
            <View style={tw`w-10 h-10 rounded-full bg-emerald-100 items-center justify-center mr-3`}>
              <Ionicons name="bulb-outline" size={22} color="#059669" />
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`font-semibold text-emerald-900 mb-1`}>Raise basket size</Text>
              <Text style={tw`text-sm text-emerald-800 leading-5`}>
                Bundle complementary SKUs — your AOV is ${aov.toFixed(2)}, below the $25 target.
              </Text>
            </View>
          </View>
        ) : null}

        <SectionLabel>Revenue</SectionLabel>
        <View style={tw`flex-row flex-wrap gap-3 mb-5`}>
          <KpiCard label="Net revenue" value={`$${Number(net).toFixed(2)}`} icon="cash-outline" />
          <KpiCard label="Gross revenue" value={`$${Number(gross).toFixed(2)}`} icon="trending-up-outline" />
          <KpiCard label="Refunds" value={`$${Number(refunds).toFixed(2)}`} icon="return-down-back-outline" trend="down" />
          <KpiCard label="Refund rate" value={`${Number(refundRate).toFixed(1)}%`} icon="stats-chart-outline" />
          <KpiCard label="AOV" value={`$${Number(aov).toFixed(2)}`} icon="cart-outline" />
          <KpiCard label="Units sold" value={String(unitsSold)} icon="cube-outline" />
        </View>

        <SectionLabel>Order rhythm</SectionLabel>
        <View style={tw`bg-white rounded-2xl p-4 mb-5 border border-stone-100`}>
          {timeseries.length === 0 ? (
            <Text style={tw`text-sm text-stone-500`}>No revenue data in this period yet.</Text>
          ) : (
            <>
              <Text style={tw`text-xs text-stone-400 mb-3`}>Daily revenue ({period})</Text>
              <View style={tw`flex-row items-end justify-between h-32`}>
                {timeseries.map((p) => {
                  const h = Math.max(6, Math.round(((p.revenue || 0) / maxSeries) * 112));
                  const label = (p.day || '').slice(5) || p.day;
                  return (
                    <View key={p.day} style={tw`flex-1 items-center mx-0.5`}>
                      <View style={[tw`w-full rounded-t-md bg-emerald-500`, { height: h }]} />
                      <Text style={tw`text-[9px] text-stone-400 mt-1`} numberOfLines={1}>
                        {label}
                      </Text>
                      <Text style={tw`text-[10px] font-semibold text-stone-600`}>
                        ${(p.revenue || 0).toFixed(0)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        <SectionLabel>Order funnel</SectionLabel>
        <View style={tw`bg-white rounded-2xl p-4 mb-5 border border-stone-100`}>
          {!funnel ? (
            <Text style={tw`text-sm text-stone-500`}>No funnel data for this period.</Text>
          ) : (
            FUNNEL_STEPS.map(({ key, label, color }) => {
              const count = funnel[key] ?? 0;
              const pct = Math.round((count / maxFunnel) * 100);
              return (
                <View key={key} style={tw`mb-3 last:mb-0`}>
                  <View style={tw`flex-row justify-between mb-1`}>
                    <Text style={tw`text-sm text-stone-700`}>{label}</Text>
                    <Text style={tw`text-sm font-semibold text-stone-900`}>{count}</Text>
                  </View>
                  <View style={tw`h-2 bg-stone-100 rounded-full overflow-hidden`}>
                    <View
                      style={[
                        tw`h-full rounded-full`,
                        { width: `${pct}%`, backgroundColor: color },
                      ]}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>

        <SectionLabel>Top products</SectionLabel>
        <View style={tw`bg-white rounded-2xl p-4 mb-5 border border-stone-100`}>
          {topProducts.length === 0 ? (
            <Text style={tw`text-sm text-stone-500`}>No product sales in this period.</Text>
          ) : (
            topProducts.map((p, idx) => (
              <View
                key={p.id}
                style={tw`flex-row items-center py-2.5 ${idx < topProducts.length - 1 ? 'border-b border-stone-100' : ''}`}
              >
                <Text style={tw`w-6 text-sm font-bold text-stone-400`}>{idx + 1}</Text>
                <View style={tw`flex-1 pr-2`}>
                  <Text style={tw`text-sm font-medium text-stone-900`} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={tw`text-xs text-stone-500`}>{p.units_sold} units</Text>
                </View>
                <Text style={tw`text-sm font-semibold text-emerald-700`}>
                  ${Number(p.revenue).toFixed(2)}
                </Text>
              </View>
            ))
          )}
        </View>

        <SectionLabel>Inventory</SectionLabel>
        <View style={tw`flex-row flex-wrap gap-3 mb-5`}>
          <KpiCard
            label="Inventory value"
            value={`$${Number(kpis?.inventory_value ?? 0).toFixed(2)}`}
            icon="layers-outline"
          />
          <KpiCard
            label="Low stock SKUs"
            value={String(kpis?.low_stock_count ?? 0)}
            icon="alert-circle-outline"
            trend={(kpis?.low_stock_count ?? 0) > 0 ? 'down' : 'neutral'}
          />
          <KpiCard
            label="Out of stock"
            value={String(kpis?.out_of_stock_count ?? 0)}
            icon="close-circle-outline"
            trend={(kpis?.out_of_stock_count ?? 0) > 0 ? 'down' : 'neutral'}
          />
        </View>

        <SectionLabel>Partnerships</SectionLabel>
        <View style={tw`bg-white rounded-2xl p-4 mb-4 border border-stone-100`}>
          {growStatus === 'loading' && sortedPartners.length === 0 ? (
            <ActivityIndicator color="#059669" />
          ) : sortedPartners.length === 0 ? (
            <Text style={tw`text-sm text-stone-500`}>No partnership performance data yet.</Text>
          ) : (
            sortedPartners.map((p, idx) => (
              <View
                key={p.id}
                style={tw`flex-row items-center py-2.5 ${idx < sortedPartners.length - 1 ? 'border-b border-stone-100' : ''}`}
              >
                <View style={tw`w-9 h-9 rounded-full bg-stone-100 items-center justify-center mr-3`}>
                  <Text style={tw`text-lg`}>{p.instructor_avatar || '👤'}</Text>
                </View>
                <View style={tw`flex-1 pr-2`}>
                  <Text style={tw`text-sm font-medium text-stone-900`} numberOfLines={1}>
                    {p.instructor_name}
                  </Text>
                  <Text style={tw`text-xs text-stone-500 capitalize`}>
                    {p.status} · {p.commission_rate ?? 0}%
                  </Text>
                </View>
                <Text style={tw`text-sm font-semibold text-emerald-700`}>
                  ${p.attributed_revenue.toFixed(2)}
                </Text>
              </View>
            ))
          )}
        </View>

        {status === 'loading' && kpis ? (
          <Text style={tw`text-center text-xs text-stone-400`}>Refreshing…</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
