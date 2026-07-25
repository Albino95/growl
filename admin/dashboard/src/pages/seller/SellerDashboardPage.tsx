import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  ShoppingBag,
  Package,
  AlertTriangle,
  RotateCcw,
  TrendingUp,
  Inbox,
} from 'lucide-react';
import { sellerRequest, type DashboardKpis } from '../../services/api/sellerClient';
import { PageHeader } from '../../components/ui/PageHeader';
import { KpiCard, KpiSkeleton } from '../../components/ui/KpiCard';
import { Card } from '../../components/ui/Card';
import { AlertBanner } from '../../components/ui/AlertBanner';
import { Badge } from '../../components/ui/Badge';
import { staggerContainer } from '../../lib/motion';
import { motion } from 'framer-motion';

type Period = 'today' | 'week' | 'month';

type Timeseries = { period: string; series: Array<{ day: string; orders: number; revenue: number }> };
type TopProducts = {
  period: string;
  products: Array<{ id: string; name: string; revenue: number; units_sold: number }>;
};

export function SellerDashboardPage() {
  const [period, setPeriod] = useState<Period>('week');
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [series, setSeries] = useState<Timeseries['series']>([]);
  const [top, setTop] = useState<TopProducts['products']>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      sellerRequest<{ kpis: DashboardKpis }>(`/business/dashboard?period=${period}`),
      sellerRequest<Timeseries>(`/business/analytics/timeseries?period=${period}`),
      sellerRequest<TopProducts>(`/business/analytics/top-products?period=${period}`),
    ])
      .then(([dash, ts, tp]) => {
        if (cancelled) return;
        setKpis(dash.kpis);
        setSeries(ts.series || []);
        setTop(tp.products || []);
        setError('');
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const maxRevenue = Math.max(1, ...series.map((s) => Number(s.revenue) || 0));

  return (
    <div>
      <PageHeader
        title="Seller dashboard"
        subtitle="Commerce KPIs for your Grow! storefront"
        action={
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            {(['today', 'week', 'month'] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${
                  period === p ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        }
      />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      {loading && !kpis ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <KpiCard
            label="Net revenue"
            value={`$${Number(kpis?.net_revenue ?? 0).toFixed(0)}`}
            icon={DollarSign}
            accent="bg-emerald-50 text-emerald-600"
            href="/seller/reports"
            hrefLabel={`${kpis?.deltas?.net_revenue_pct ?? 0}% vs prior`}
          />
          <KpiCard
            label="Orders"
            value={kpis?.total_orders ?? 0}
            icon={ShoppingBag}
            href="/seller/orders"
            hrefLabel="View orders"
          />
          <KpiCard label="AOV" value={`$${Number(kpis?.aov ?? 0).toFixed(2)}`} icon={TrendingUp} />
          <KpiCard
            label="Pending fulfillment"
            value={kpis?.pending_orders ?? 0}
            icon={Inbox}
            accent="bg-amber-50 text-amber-600"
            href="/seller/orders"
            hrefLabel="Fulfill"
          />
          <KpiCard
            label="Low / out of stock"
            value={`${kpis?.low_stock_count ?? 0} / ${kpis?.out_of_stock_count ?? 0}`}
            icon={AlertTriangle}
            accent="bg-orange-50 text-orange-600"
            href="/seller/products"
            hrefLabel="Catalog"
          />
          <KpiCard
            label="Refunds"
            value={`$${Number(kpis?.refunds ?? 0).toFixed(0)} (${kpis?.refund_rate ?? 0}%)`}
            icon={RotateCcw}
            accent="bg-rose-50 text-rose-600"
          />
        </motion.div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card padding="md">
          <h2 className="text-sm font-semibold text-slate-900">Revenue by day</h2>
          <div className="mt-4 flex h-40 items-end gap-1">
            {series.length === 0 ? (
              <p className="text-sm text-slate-500">No sales in this period.</p>
            ) : (
              series.map((s) => (
                <div key={s.day} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-emerald-500/80"
                    style={{ height: `${Math.max(4, (Number(s.revenue) / maxRevenue) * 100)}%` }}
                    title={`$${Number(s.revenue).toFixed(0)} · ${s.orders} orders`}
                  />
                  <span className="text-[9px] text-slate-400">{s.day.slice(5)}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card padding="md">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Top products</h2>
            <Link to="/seller/products" className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
              Catalog
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {top.length === 0 ? (
              <li className="text-sm text-slate-500">No product sales yet.</li>
            ) : (
              top.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="truncate font-medium text-slate-800">{p.name}</span>
                  <span className="shrink-0 text-slate-500">
                    ${Number(p.revenue).toFixed(0)} · {p.units_sold} u
                  </span>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      <Card padding="md" className="mt-6">
        <h2 className="text-sm font-semibold text-slate-900">Action inbox</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(kpis?.pending_orders || 0) > 0 && (
            <Badge variant="pending">{kpis?.pending_orders} orders to fulfill</Badge>
          )}
          {(kpis?.low_stock_count || 0) > 0 && (
            <Badge variant="pending">{kpis?.low_stock_count} SKUs low stock</Badge>
          )}
          {(kpis?.pending_partner_requests || 0) > 0 && (
            <Badge>{kpis?.pending_partner_requests} partnership requests</Badge>
          )}
          {!kpis?.action_items_count ? (
            <p className="text-sm text-slate-500">You&apos;re caught up for this period.</p>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/seller/orders"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ShoppingBag className="h-4 w-4" /> Orders
          </Link>
          <Link
            to="/seller/products"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Package className="h-4 w-4" /> Products
          </Link>
        </div>
      </Card>
    </div>
  );
}
