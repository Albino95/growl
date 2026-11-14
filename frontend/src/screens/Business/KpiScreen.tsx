import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';
import BrandLoadingScreen from '../../components/common/BrandLoadingScreen';
import { verticalScrollProps } from '../../constants/scroll';
import { useBusinessDashboard } from '../../hooks/useBusinessDashboard';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchBusinessGrow } from '../../store/slices/businessSlice';
import { exportOrdersCsv } from '../../services/api/business';
import { downloadCsv } from '../../utils/csvDownload';
import { alertMessage } from '../../utils/confirmDialog';
import { formatCurrency } from '../../utils/money';
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
  const [exportBusy, setExportBusy] = useState(false);

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

  const handleExportOrders = async () => {
    try {
      setExportBusy(true);
      const csv = await exportOrdersCsv(period);
      await downloadCsv(`orders-${period}.csv`, csv);
    } catch (e: unknown) {
      alertMessage('Export failed', e instanceof Error ? e.message : 'Could not export orders');
    } finally {
      setExportBusy(false);
    }
  };

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
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['bottom']}>
        <BrandLoadingScreen variant="page" message="Loading analytics…" manageStatusBar={false} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['bottom']}>
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`px-gutter-wide pt-3 pb-10`}
        {...verticalScrollProps}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.brand}
            colors={[theme.colors.brand]}
          />
        }
      >
        {error ? (
          <View style={tw`mb-3 px-3 py-2 rounded-control bg-red-50 border border-red-200`}>
            <Text style={tw`text-sm text-red-700 mb-2`}>{error}</Text>
            <PressableScale onPress={() => void refresh({ force: true })}>
              <Text style={tw`text-sm font-semibold text-red-800`}>Retry</Text>
            </PressableScale>
          </View>
        ) : null}

        <View style={tw`flex-row items-center justify-between mb-4`}>
          <View style={tw`flex-1 mr-3`}>
            <PeriodToggle value={period} onChange={setPeriod} />
          </View>
          <PressableScale
            onPress={() => void handleExportOrders()}
            disabled={exportBusy}
            style={tw`px-3 py-2 rounded-control bg-emerald-50 border border-emerald-200 flex-row items-center ${exportBusy ? 'opacity-60' : ''}`}
          >
            <Ionicons name="download-outline" size={16} color={theme.colors.brand} />
            <Text style={tw`text-xs font-semibold text-emerald-800 ml-1`}>
              {exportBusy ? 'Exporting…' : 'Export orders'}
            </Text>
          </PressableScale>
        </View>

        {showBasketTip ? (
          <View style={tw`flex-row bg-emerald-50 border border-emerald-200 rounded-card p-4 mb-4`}>
            <View style={tw`w-10 h-10 rounded-full bg-emerald-100 items-center justify-center mr-3`}>
              <Ionicons name="bulb-outline" size={22} color={theme.colors.brand} />
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`font-semibold text-emerald-900 mb-1`}>Raise basket size</Text>
              <Text style={tw`text-sm text-emerald-800 leading-5`}>
                Bundle complementary SKUs — your AOV is {formatCurrency(aov)}, below the {formatCurrency(25)} target.
              </Text>
            </View>
          </View>
        ) : null}

        <SectionLabel>Revenue</SectionLabel>
        <View style={tw`flex-row flex-wrap gap-3 mb-5`}>
          <KpiCard label="Net revenue" value={formatCurrency(Number(net))} icon="cash-outline" />
          <KpiCard label="Gross revenue" value={formatCurrency(Number(gross))} icon="trending-up-outline" />
          <KpiCard label="Refunds" value={formatCurrency(Number(refunds))} icon="return-down-back-outline" trend="down" />
          <KpiCard label="Refund rate" value={`${Number(refundRate).toFixed(1)}%`} icon="stats-chart-outline" />
          <KpiCard label="AOV" value={formatCurrency(Number(aov))} icon="cart-outline" />
          <KpiCard label="Units sold" value={String(unitsSold)} icon="cube-outline" />
        </View>

        <SectionLabel>Order rhythm</SectionLabel>
        <View style={tw`bg-card rounded-card p-4 mb-5 border border-line`}>
          {timeseries.length === 0 ? (
            <Text style={tw`text-sm text-ink-3`}>No revenue data in this period yet.</Text>
          ) : (
            <>
              <Text style={tw`text-xs text-ink-3 mb-3`}>Daily revenue ({period})</Text>
              <View style={tw`flex-row items-end justify-between h-32`}>
                {timeseries.map((p) => {
                  const h = Math.max(6, Math.round(((p.revenue || 0) / maxSeries) * 112));
                  const label = (p.day || '').slice(5) || p.day;
                  return (
                    <View key={p.day} style={tw`flex-1 items-center mx-0.5`}>
                      <View style={[tw`w-full rounded-t-md bg-emerald-500`, { height: h }]} />
                      <Text style={tw`text-caption text-ink-3 mt-1`} numberOfLines={1}>
                        {label}
                      </Text>
                      <Text style={tw`text-caption font-semibold text-ink-2`}>
                        {formatCurrency(Math.round(p.revenue || 0))}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        <SectionLabel>Order funnel</SectionLabel>
        <View style={tw`bg-card rounded-card p-4 mb-5 border border-line`}>
          {!funnel ? (
            <Text style={tw`text-sm text-ink-3`}>No funnel data for this period.</Text>
          ) : (
            FUNNEL_STEPS.map(({ key, label, color }) => {
              const count = funnel[key] ?? 0;
              const pct = Math.round((count / maxFunnel) * 100);
              return (
                <View key={key} style={tw`mb-3 last:mb-0`}>
                  <View style={tw`flex-row justify-between mb-1`}>
                    <Text style={tw`text-sm text-ink-2`}>{label}</Text>
                    <Text style={tw`text-sm font-semibold text-ink`}>{count}</Text>
                  </View>
                  <View style={tw`h-2 bg-raised rounded-chip overflow-hidden`}>
                    <View
                      style={[
                        tw`h-full rounded-chip`,
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
        <View style={tw`bg-card rounded-card p-4 mb-5 border border-line`}>
          {topProducts.length === 0 ? (
            <Text style={tw`text-sm text-ink-3`}>No product sales in this period.</Text>
          ) : (
            topProducts.map((p, idx) => (
              <View
                key={p.id}
                style={tw`flex-row items-center py-2.5 ${idx < topProducts.length - 1 ? 'border-b border-line' : ''}`}
              >
                <Text style={tw`w-6 text-sm font-bold text-ink-3`}>{idx + 1}</Text>
                <View style={tw`flex-1 pr-2`}>
                  <Text style={tw`text-sm font-medium text-ink`} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={tw`text-xs text-ink-3`}>{p.units_sold} units</Text>
                </View>
                <Text style={tw`text-sm font-semibold text-emerald-700`}>
                  {formatCurrency(Number(p.revenue || 0))}
                </Text>
              </View>
            ))
          )}
        </View>

        <SectionLabel>Inventory</SectionLabel>
        <View style={tw`flex-row flex-wrap gap-3 mb-5`}>
          <KpiCard
            label="Inventory value"
            value={formatCurrency(Number(kpis?.inventory_value ?? 0))}
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
        <View style={tw`bg-card rounded-card p-4 mb-4 border border-line`}>
          {growStatus === 'loading' && sortedPartners.length === 0 ? (
            <ActivityIndicator color={theme.colors.brand} />
          ) : sortedPartners.length === 0 ? (
            <Text style={tw`text-sm text-ink-3`}>No partnership performance data yet.</Text>
          ) : (
            sortedPartners.map((p, idx) => (
              <View
                key={p.id}
                style={tw`flex-row items-center py-2.5 ${idx < sortedPartners.length - 1 ? 'border-b border-line' : ''}`}
              >
                <View style={tw`w-9 h-9 rounded-full bg-raised items-center justify-center mr-3`}>
                  <Text style={tw`text-lg`}>{p.instructor_avatar || '👤'}</Text>
                </View>
                <View style={tw`flex-1 pr-2`}>
                  <Text style={tw`text-sm font-medium text-ink`} numberOfLines={1}>
                    {p.instructor_name}
                  </Text>
                  <Text style={tw`text-xs text-ink-3 capitalize`}>
                    {p.status} · {p.commission_rate ?? 0}%
                  </Text>
                </View>
                <Text style={tw`text-sm font-semibold text-emerald-700`}>
                  {formatCurrency(Number(p.attributed_revenue || 0))}
                </Text>
              </View>
            ))
          )}
        </View>

        {status === 'loading' && kpis ? (
          <Text style={tw`text-center text-xs text-ink-3`}>Refreshing…</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
