import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Flag,
  Scale,
  Lock,
  Users,
  ShoppingBag,
  DollarSign,
  Store,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { adminRequest } from '../services/api/adminClient';
import { PageHeader } from '../components/ui/PageHeader';
import { KpiCard, KpiSkeleton } from '../components/ui/KpiCard';
import { Card } from '../components/ui/Card';
import { AlertBanner } from '../components/ui/AlertBanner';
import { staggerContainer } from '../lib/motion';

type Overview = {
  kpis: {
    pending_reports: number;
    open_appeals: number;
    privacy_pending: number;
    total_users: number;
    orders_7d: number;
    revenue_7d: number;
    refunds_7d: number;
    gmv_30d?: number;
    active_sellers?: number;
    low_stock_platform?: number;
  };
  trends: { reports_7d: { day: string; count: number }[] };
};

export function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminRequest<Overview>('/admin/dashboard/overview')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const maxTrend = Math.max(1, ...(data?.trends.reports_7d.map((t) => t.count) || [1]));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Moderation, compliance, and commerce health for Grow!"
      />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <KpiCard
              label="Pending reports"
              value={data?.kpis.pending_reports ?? '—'}
              icon={Flag}
              href="/moderation"
              hrefLabel="View queue"
            />
            <KpiCard
              label="Open appeals"
              value={data?.kpis.open_appeals ?? '—'}
              icon={Scale}
              href="/appeals"
              accent="bg-violet-50 text-violet-600"
            />
            <KpiCard
              label="Privacy pending"
              value={data?.kpis.privacy_pending ?? '—'}
              icon={Lock}
              href="/privacy"
              accent="bg-blue-50 text-blue-600"
            />
            <KpiCard
              label="Total users"
              value={data?.kpis.total_users ?? '—'}
              icon={Users}
              accent="bg-slate-100 text-slate-600"
            />
            <KpiCard
              label="Orders (7d)"
              value={data?.kpis.orders_7d ?? '—'}
              icon={ShoppingBag}
              accent="bg-orange-50 text-orange-600"
            />
            <KpiCard
              label="Revenue (7d)"
              value={`$${Number(data?.kpis.revenue_7d ?? 0).toFixed(0)}`}
              icon={DollarSign}
              accent="bg-emerald-50 text-emerald-600"
            />
          </motion.div>

          <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Commerce
          </h2>
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <KpiCard
              label="GMV (30d)"
              value={`$${Number(data?.kpis.gmv_30d ?? 0).toFixed(0)}`}
              icon={TrendingUp}
              accent="bg-emerald-50 text-emerald-600"
              href="/business"
              hrefLabel="Orders"
            />
            <KpiCard
              label="Active sellers"
              value={data?.kpis.active_sellers ?? '—'}
              icon={Store}
              href="/business/accounts"
              hrefLabel="Accounts"
            />
            <KpiCard
              label="Low-stock SKUs"
              value={data?.kpis.low_stock_platform ?? '—'}
              icon={AlertTriangle}
              accent="bg-amber-50 text-amber-600"
            />
          </motion.div>
        </>
      )}

      {data && data.trends.reports_7d.length > 0 && (
        <Card className="mt-8" padding="lg">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">Reports (last 7 days)</h3>
          <div className="flex h-32 items-end gap-2">
            {data.trends.reports_7d.map((t, i) => (
              <motion.div
                key={t.day}
                initial={{ height: 0 }}
                animate={{ height: `${(t.count / maxTrend) * 100}%` }}
                transition={{ delay: i * 0.05, duration: 0.4, ease: 'easeOut' }}
                className="group flex flex-1 flex-col items-center justify-end"
              >
                <div
                  className="w-full min-h-[4px] rounded-t-md bg-gradient-to-t from-brand-600 to-brand-500 transition-opacity group-hover:opacity-80"
                  style={{ height: '100%' }}
                />
                <span className="mt-2 text-[10px] text-slate-400">{t.day.slice(5)}</span>
              </motion.div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
