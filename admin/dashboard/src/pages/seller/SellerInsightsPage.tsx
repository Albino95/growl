import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Copy, Eye, Link2, MousePointerClick, Package, Plus, Store, Trash2, Users } from 'lucide-react';
import {
  createPartnerLink,
  deletePartnerLink,
  errorMessage,
  getInsights,
  isFeatureUnavailable,
  listActivePartnerships,
  listPartnerLinks,
  listProducts,
  productStatus,
  type CatalogProduct,
  type Insights,
  type InsightsPeriod,
  type PartnerLink,
  type Partnership,
} from '../../services/api/sellerApi';
import { getCategoryLabel } from '../../data/categories';
import { formatCount, formatDate, pctChange } from '../../lib/sellerFormat';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Select } from '../../components/ui/Input';
import { ConfirmDialog } from '../../components/ui/Dialog';
import {
  ComingSoonBlock,
  DailyBars,
  EmptyBlock,
  ErrorBlock,
  IconButton,
  LoadingBlock,
  Modal,
  Segmented,
  StatTile,
  useToast,
} from '../../components/seller/SellerUI';

const PERIODS: Array<{ value: InsightsPeriod; label: string }> = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

const SOURCE_LABEL: Record<string, string> = {
  feed: 'Feed',
  search: 'Search',
  explore: 'Explore',
  storefront: 'Your storefront',
  shop: 'Shop',
  instructor: 'Instructors',
  link: 'Shared links',
  other: 'Other',
};

export function SellerInsightsPage() {
  const [period, setPeriod] = useState<InsightsPeriod>('30d');
  const [data, setData] = useState<Insights | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [err, setErr] = useState('');

  const load = useCallback(async (p: InsightsPeriod) => {
    setState('loading');
    try {
      setData(await getInsights(p));
      setState('ready');
    } catch (e) {
      if (isFeatureUnavailable(e)) setState('unavailable');
      else {
        setErr(errorMessage(e, 'Failed to load insights'));
        setState('error');
      }
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  const t = data?.totals;
  const prev = data?.previous;
  const totalViews = (t?.storefront_views || 0) + (t?.product_views || 0) + (t?.saves || 0);
  const sourceMax = Math.max(1, ...(data?.sources || []).map((s) => s.views));

  return (
    <div>
      <PageHeader
        title="Insights"
        subtitle="How people find and save your products — even while checkout is paused."
        action={<Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS} />}
      />

      {state === 'loading' && !data ? (
        <Card className="!p-0">
          <LoadingBlock rows={5} />
        </Card>
      ) : state === 'unavailable' ? (
        <Card>
          <ComingSoonBlock feature="Insights" />
        </Card>
      ) : state === 'error' ? (
        <Card>
          <ErrorBlock message={err} onRetry={() => void load(period)} />
        </Card>
      ) : data && t && prev ? (
        <div className={`space-y-6 ${state === 'loading' ? 'opacity-60 transition-opacity' : ''}`} aria-busy={state === 'loading'}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            <StatTile label="Storefront views" icon={Store} value={formatCount(t.storefront_views)} delta={pctChange(t.storefront_views, prev.storefront_views)} />
            <StatTile label="Product views" icon={Eye} value={formatCount(t.product_views)} delta={pctChange(t.product_views, prev.product_views)} />
            <StatTile label="Saves" icon={Bookmark} value={formatCount(t.saves)} delta={pctChange(t.saves, prev.saves)} />
            <StatTile label="Link taps" icon={MousePointerClick} value={formatCount(t.link_taps)} delta={pctChange(t.link_taps, prev.link_taps)} />
            <StatTile label="Partner clicks" icon={Link2} value={formatCount(t.partner_clicks)} delta={pctChange(t.partner_clicks, prev.partner_clicks)} />
          </div>

          <Card padding="md">
            <h2 className="mb-3 text-sm font-semibold text-stone-900">Day by day</h2>
            {totalViews === 0 ? (
              <EmptyBlock
                icon={Eye}
                title="No views yet in this period"
                description="Add photos, feature products on your storefront and post in Grow! — people find businesses through posts and paths."
              />
            ) : (
              <DailyBars
                data={data.daily}
                label={`Daily storefront views, product views and saves over ${period}`}
                series={[
                  { key: 'storefront_views', label: 'Storefront views', color: '#047857' },
                  { key: 'product_views', label: 'Product views', color: '#34d399' },
                  { key: 'saves', label: 'Saves', color: '#F97066' },
                ]}
              />
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card padding="md">
              <h2 className="mb-3 text-sm font-semibold text-stone-900">Top products</h2>
              {data.top_products.length === 0 ? (
                <p className="text-sm text-stone-500">No product views yet.</p>
              ) : (
                <ol className="space-y-2">
                  {data.top_products.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3 text-sm">
                      <span className="w-5 text-right text-xs tabular-nums text-stone-400">{i + 1}</span>
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted" aria-hidden>
                          <Package className="h-4 w-4 text-stone-400" />
                        </div>
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                      <span className="tabular-nums text-stone-600">{formatCount(p.views)} views</span>
                      <span className="w-16 text-right tabular-nums text-stone-600">{formatCount(p.saves)} saves</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card padding="md">
              <h2 className="mb-3 text-sm font-semibold text-stone-900">Where views come from</h2>
              {data.sources.length === 0 ? (
                <p className="text-sm text-stone-500">No views yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.sources.map((s) => (
                    <li key={s.source} className="text-sm">
                      <div className="mb-1 flex justify-between">
                        <span>{SOURCE_LABEL[s.source] || s.source}</span>
                        <span className="tabular-nums text-stone-600">{formatCount(s.views)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-muted" aria-hidden>
                        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(s.views / sourceMax) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card padding="md">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-stone-900">
              <Users className="h-4 w-4 text-brand-600" aria-hidden /> Your audience’s growth paths
            </h2>
            {!data.audience ? (
              <p className="text-sm text-stone-500">
                We show this once at least 20 different people have visited, so no one can be singled out.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.audience.top_paths.map((p) => (
                  <span key={p.path} className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700">
                    {getCategoryLabel(p.path.split(':')[0])} · {Math.round(p.share * 100)}%
                  </span>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      <PartnerLinksSection />
    </div>
  );
}

function PartnerLinksSection() {
  const toast = useToast();
  const [links, setLinks] = useState<PartnerLink[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [partners, setPartners] = useState<Partnership[] | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [productId, setProductId] = useState('');
  const [creating, setCreating] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<PartnerLink | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      setLinks(await listPartnerLinks());
      setState('ready');
    } catch (e) {
      if (isFeatureUnavailable(e)) setState('unavailable');
      else {
        setErr(errorMessage(e, 'Failed to load partner links'));
        setState('error');
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openCreate() {
    setCreateOpen(true);
    setPartnerId('');
    setProductId('');
    if (partners === null) {
      const [ps, prods] = await Promise.all([
        listActivePartnerships().catch(() => [] as Partnership[]),
        listProducts().catch(() => [] as CatalogProduct[]),
      ]);
      setPartners(ps);
      setProducts(prods.filter((p) => productStatus(p) === 'active'));
    }
  }

  async function create() {
    if (!partnerId) return;
    setCreating(true);
    try {
      setLinks(await createPartnerLink({ partnership_id: partnerId, product_id: productId || null }));
      toast('Link ready — share it with your partner');
      setCreateOpen(false);
    } catch (e) {
      toast(errorMessage(e, 'Could not create the link'), 'error');
    } finally {
      setCreating(false);
    }
  }

  async function remove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await deletePartnerLink(removeTarget.id);
      setLinks((l) => l.filter((x) => x.id !== removeTarget.id));
      toast('Link turned off');
      setRemoveTarget(null);
    } catch (e) {
      toast(errorMessage(e, 'Could not remove the link'), 'error');
    } finally {
      setRemoving(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      toast('Copy failed — select the link and copy it manually', 'error');
    }
  }

  return (
    <section className="mt-10" aria-labelledby="partner-links-h">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="partner-links-h" className="text-lg font-semibold text-stone-900">Partner links</h2>
          <p className="text-sm text-stone-500">Give instructors you partner with a tracked link, then see the clicks and saves it brings.</p>
        </div>
        {state === 'ready' && (
          <Button onClick={() => void openCreate()}>
            <Plus className="h-4 w-4" aria-hidden /> New link
          </Button>
        )}
      </div>
      <Card className="overflow-hidden !p-0">
        {state === 'loading' ? (
          <LoadingBlock rows={3} />
        ) : state === 'unavailable' ? (
          <ComingSoonBlock feature="Partner links" />
        ) : state === 'error' ? (
          <ErrorBlock message={err} onRetry={() => void load()} />
        ) : links.length === 0 ? (
          <EmptyBlock icon={Link2} title="No partner links yet" description="Create one for an instructor you work with — they share it, you see what it brings." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <th className="px-4 py-3">Partner</th>
                  <th className="px-4 py-3">Link</th>
                  <th className="px-4 py-3 text-right">Clicks</th>
                  <th className="px-4 py-3 text-right">Saves</th>
                  <th className="hidden px-4 py-3 md:table-cell">Created</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {links.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{l.instructor.name}</p>
                      <p className="text-xs text-stone-500">{l.product_name ? `For ${l.product_name}` : 'Your storefront'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-surface-page px-1.5 py-0.5 text-xs">{l.url.replace(/^https:\/\//, '')}</code>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCount(l.clicks)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCount(l.saves_attributed)}</td>
                    <td className="hidden px-4 py-3 text-stone-600 md:table-cell">{formatDate(l.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <IconButton label={`Copy link for ${l.instructor.name}`} icon={Copy} onClick={() => void copy(l.url)} />
                      <IconButton label={`Turn off link for ${l.instructor.name}`} icon={Trash2} tone="danger" onClick={() => setRemoveTarget(l)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        size="sm"
        title="New partner link"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={creating} disabled={!partnerId} onClick={() => void create()}>
              Create link
            </Button>
          </>
        }
      >
        {partners === null ? (
          <LoadingBlock rows={2} />
        ) : partners.length === 0 ? (
          <p className="text-sm text-stone-600">
            Links are for instructors you have an active partnership with. Partnerships are managed in the Grow! app under Business → Partners.
          </p>
        ) : (
          <>
            <Field label="Partner">
              <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">Choose an instructor…</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.instructor_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Links to">
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Your storefront</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-xs text-stone-500">
              Clicks are counted when someone opens the link. <Link to="/seller/storefront" className="underline">Polish your storefront</Link> first so it lands well.
            </p>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        title="Turn off this link?"
        message="The link stops working for anyone who has it. Its past clicks stay in your totals."
        confirmLabel="Turn off"
        variant="danger"
        loading={removing}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void remove()}
      />
    </section>
  );
}
