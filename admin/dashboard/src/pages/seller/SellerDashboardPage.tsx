import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  Check,
  Euro,
  ExternalLink,
  Eye,
  Inbox,
  MessageCircleQuestion,
  ShoppingBag,
  Star,
  Store,
  TrendingUp,
} from 'lucide-react';
import { sellerRequest, type DashboardKpis } from '../../services/api/sellerClient';
import {
  errorMessage,
  getEngageSummary,
  getInsights,
  getOnboarding,
  getSettings,
  type Insights,
  type Onboarding,
} from '../../services/api/sellerApi';
import { formatCount, formatEur, pctChange } from '../../lib/sellerFormat';
import { PageHeader } from '../../components/ui/PageHeader';
import { KpiCard, KpiSkeleton } from '../../components/ui/KpiCard';
import { Card } from '../../components/ui/Card';
import { staggerContainer } from '../../lib/motion';
import { DailyBars, ErrorBlock, Segmented, StatTile } from '../../components/seller/SellerUI';

type Period = 'today' | 'week' | 'month';
type Timeseries = { period: string; series: Array<{ day: string; orders: number; revenue: number }> };
type TopProducts = { period: string; products: Array<{ id: string; name: string; revenue: number; units_sold: number }> };

const STEP_INFO: Record<string, { label: string; hint: string; to?: string }> = {
  profile: { label: 'Add your business name', hint: 'So people know who they’re buying from.', to: '/seller/settings' },
  logo: { label: 'Upload a logo', hint: 'It shows on your storefront and products.', to: '/seller/settings' },
  first_product: { label: 'Add your first product', hint: 'Start small — you can import a CSV later.', to: '/seller/products' },
  product_photos: { label: 'Give every product a photo', hint: 'Products with photos get saved far more.', to: '/seller/products' },
  shipping_note: { label: 'Write a shipping note', hint: 'Tell customers how and when you ship.', to: '/seller/settings' },
  first_post: { label: 'Share your first post', hint: 'Post in the Grow! app so people on your paths find you.' },
};

function OnboardingCard({ data }: { data: Onboarding }) {
  const pct = Math.round((data.done / Math.max(1, data.total)) * 100);
  return (
    <Card padding="lg" className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-stone-900">Set up your shop</h2>
          <p className="text-sm text-stone-500">
            {data.done} of {data.total} done — a complete page helps people trust you.
          </p>
        </div>
        <div className="flex w-40 items-center gap-2" aria-label={`${pct}% complete`}>
          <div className="h-2 flex-1 rounded-full bg-surface-muted">
            <div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-semibold tabular-nums text-brand-700">{pct}%</span>
        </div>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {data.steps.map((s) => {
          const info = STEP_INFO[s.key] || { label: s.key, hint: '' };
          const body = (
            <>
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  s.done ? 'bg-brand-600 text-white' : 'border-2 border-stone-300'
                }`}
                aria-hidden
              >
                {s.done && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${s.done ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
                  {info.label}
                  <span className="sr-only">{s.done ? ' (done)' : ' (to do)'}</span>
                </span>
                {!s.done && <span className="block text-xs text-stone-500">{info.hint}</span>}
              </span>
              {!s.done && info.to && <ArrowRight className="mt-0.5 h-4 w-4 text-stone-400" aria-hidden />}
            </>
          );
          return (
            <li key={s.key}>
              {!s.done && info.to ? (
                <Link to={info.to} className="focus-ring flex items-start gap-3 rounded-xl p-2.5 hover:bg-surface-page">
                  {body}
                </Link>
              ) : (
                <div className="flex items-start gap-3 rounded-xl p-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function SellerDashboardPage() {
  const [period, setPeriod] = useState<Period>('week');
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [series, setSeries] = useState<Timeseries['series']>([]);
  const [top, setTop] = useState<TopProducts['products']>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [engage, setEngage] = useState<{ unanswered_questions: number; unreplied_reviews: number } | null>(null);
  const [name, setName] = useState('');

  // Optional extras: each degrades silently (404 while rolling out).
  useEffect(() => {
    getOnboarding().then(setOnboarding).catch(() => undefined);
    getInsights('7d').then(setInsights).catch(() => undefined);
    getEngageSummary().then(setEngage).catch(() => undefined);
    getSettings()
      .then((s) => setName(s.business_name || ''))
      .catch(() => undefined);
  }, []);

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
        if (!cancelled) setError(errorMessage(e, 'Failed to load dashboard'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, reload]);

  const attention = [
    kpis?.pending_orders ? { to: '/seller/orders', icon: Inbox, text: `${kpis.pending_orders} ${kpis.pending_orders === 1 ? 'order' : 'orders'} to fulfil` } : null,
    engage?.unanswered_questions ? { to: '/seller/engagement', icon: MessageCircleQuestion, text: `${engage.unanswered_questions} ${engage.unanswered_questions === 1 ? 'question' : 'questions'} waiting` } : null,
    engage?.unreplied_reviews ? { to: '/seller/engagement', icon: Star, text: `${engage.unreplied_reviews} new ${engage.unreplied_reviews === 1 ? 'review' : 'reviews'}` } : null,
    kpis?.low_stock_count ? { to: '/seller/products', icon: AlertTriangle, text: `${kpis.low_stock_count} running low on stock` } : null,
    kpis?.out_of_stock_count ? { to: '/seller/products', icon: AlertTriangle, text: `${kpis.out_of_stock_count} sold out` } : null,
  ].filter(Boolean) as Array<{ to: string; icon: typeof Inbox; text: string }>;

  const t = insights?.totals;
  const p = insights?.previous;

  return (
    <div>
      <PageHeader
        title={name ? `Hi, ${name}` : 'Your business'}
        subtitle="Here’s how your shop is doing on Grow!"
        action={
          <Link
            to="/seller/storefront/view"
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-surface-page"
          >
            <ExternalLink className="h-4 w-4" aria-hidden /> View storefront
          </Link>
        }
      />

      {onboarding && !onboarding.complete && <OnboardingCard data={onboarding} />}

      {attention.length > 0 && (
        <Card padding="md" className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-stone-900">Needs your attention</h2>
          <ul className="flex flex-wrap gap-2">
            {attention.map((a) => (
              <li key={a.text}>
                <Link to={a.to} className="focus-ring inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100">
                  <a.icon className="h-4 w-4" aria-hidden /> {a.text}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {t && p && (
        <section aria-labelledby="dash-reach" className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="dash-reach" className="text-sm font-semibold text-stone-900">Reach · last 7 days</h2>
            <Link to="/seller/insights" className="text-sm font-medium text-brand-700 hover:underline">
              All insights
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Storefront views" icon={Store} value={formatCount(t.storefront_views)} delta={pctChange(t.storefront_views, p.storefront_views)} />
            <StatTile label="Product views" icon={Eye} value={formatCount(t.product_views)} delta={pctChange(t.product_views, p.product_views)} />
            <StatTile label="Saves" icon={Bookmark} value={formatCount(t.saves)} delta={pctChange(t.saves, p.saves)} />
          </div>
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-stone-900">Sales</h2>
        <Segmented
          label="Sales period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
      </div>

      {error ? (
        <Card>
          <ErrorBlock message={error} onRetry={() => setReload((n) => n + 1)} />
        </Card>
      ) : loading && !kpis ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Net revenue"
              value={formatEur(kpis?.net_revenue ?? 0)}
              icon={Euro}
              href="/seller/reports"
              hrefLabel={`${kpis?.deltas?.net_revenue_pct ?? 0}% vs previous`}
            />
            <KpiCard label="Orders" value={kpis?.total_orders ?? 0} icon={ShoppingBag} href="/seller/orders" hrefLabel="View orders" />
            <KpiCard label="Average order" value={formatEur(kpis?.aov ?? 0)} icon={TrendingUp} />
            <KpiCard
              label="Refunds"
              value={`${formatEur(kpis?.refunds ?? 0)} (${kpis?.refund_rate ?? 0}%)`}
              icon={AlertTriangle}
              accent="bg-rose-50 text-rose-600"
            />
          </motion.div>
          {(kpis?.total_orders ?? 0) === 0 && (
            <p className="mt-3 text-sm text-stone-500">
              Checkout in the app is paused for now — people can browse and save your products. Sales will show here once it opens.
            </p>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card padding="md">
              <h3 className="mb-3 text-sm font-semibold text-stone-900">Revenue by day</h3>
              {series.length === 0 || series.every((s) => !Number(s.revenue)) ? (
                <p className="py-10 text-center text-sm text-stone-500">No sales in this period.</p>
              ) : (
                <DailyBars
                  data={series}
                  label="Revenue by day"
                  series={[{ key: 'revenue', label: 'Revenue (€)', color: '#059669' }]}
                  height={150}
                />
              )}
            </Card>
            <Card padding="md">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-900">Top sellers</h3>
                <Link to="/seller/products" className="text-sm font-medium text-brand-700 hover:underline">
                  Products
                </Link>
              </div>
              {top.length === 0 ? (
                <p className="py-10 text-center text-sm text-stone-500">No product sales yet.</p>
              ) : (
                <ul className="space-y-3">
                  {top.slice(0, 5).map((tp) => (
                    <li key={tp.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium text-stone-800">{tp.name}</span>
                      <span className="shrink-0 tabular-nums text-stone-500">
                        {formatEur(tp.revenue)} · {tp.units_sold} sold
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
