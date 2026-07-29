import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Package, DollarSign, ShoppingBag, AlertTriangle } from 'lucide-react';
import { adminRequest } from '../services/api/adminClient';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { KpiCard, KpiSkeleton } from '../components/ui/KpiCard';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge, statusBadge } from '../components/ui/Badge';
import { PageLoader } from '../components/ui/Skeleton';
import { staggerContainer } from '../lib/motion';
import { motion } from 'framer-motion';

type OverviewResponse = {
  user: { id: string; email: string; created_at: string };
  profile: Record<string, unknown> | null;
  overview: {
    product_count: number;
    gmv_30d: number;
    orders_30d: number;
    low_stock_count: number;
    out_of_stock_count: number;
    low_stock_threshold: number;
    verification_status: string;
  };
};

export function BusinessAccountDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    adminRequest<OverviewResponse>(`/admin/business/accounts/${userId}/overview`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <PageLoader />;

  const o = data?.overview;
  const displayName =
    (data?.profile?.display_name as string) || data?.user.email || 'Business';

  return (
    <div>
      <Link
        to="/business/accounts"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
      >
        <ArrowLeft className="h-4 w-4" /> All accounts
      </Link>
      <PageHeader
        title={displayName}
        subtitle={data?.user.email}
        action={
          o ? (
            <Badge variant={statusBadge(o.verification_status)}>{o.verification_status}</Badge>
          ) : null
        }
      />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      {!data ? null : (
        <>
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <KpiCard
              label="GMV (30d)"
              value={`$${Number(o?.gmv_30d ?? 0).toFixed(0)}`}
              icon={DollarSign}
              accent="bg-emerald-50 text-emerald-600"
            />
            <KpiCard label="Orders (30d)" value={o?.orders_30d ?? 0} icon={ShoppingBag} />
            <KpiCard label="Products" value={o?.product_count ?? 0} icon={Package} />
            <KpiCard
              label="Low / out of stock"
              value={`${o?.low_stock_count ?? 0} / ${o?.out_of_stock_count ?? 0}`}
              icon={AlertTriangle}
              accent="bg-amber-50 text-amber-600"
            />
          </motion.div>

          <Card padding="md" className="mt-6">
            <h2 className="text-sm font-semibold text-slate-900">Profile</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Field</dt>
                <dd className="font-medium text-slate-900">
                  {String(data.profile?.field_of_operation || '—')}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Contact</dt>
                <dd className="font-medium text-slate-900">
                  {String(data.profile?.contact_email || data.user.email)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Created</dt>
                <dd className="font-medium text-slate-900">
                  {new Date(data.user.created_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to="/business"
                className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
              >
                Platform orders →
              </Link>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Sellers manage catalog and fulfillment in the Seller portal (Seller tab on login) or the
              Grow! mobile app.
            </p>
          </Card>
        </>
      )}

      {!data && !error ? <KpiSkeleton /> : null}
    </div>
  );
}
