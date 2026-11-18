import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Truck, MapPin, User, Package as PackageIcon } from 'lucide-react';
import {
  NEXT_STATUSES,
  ORDERS_PAGE,
  errorMessage,
  getOrderContact,
  listOrders,
  setOrderFulfillment,
  setOrderStatus,
  type OrderStatus,
  type SellerOrderRow,
} from '../../services/api/sellerApi';
import { formatDate, formatEur } from '../../lib/sellerFormat';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Input';
import { ConfirmDialog } from '../../components/ui/Dialog';
import {
  EmptyBlock,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  Modal,
  PAGE_SIZE,
  Pagination,
  SearchField,
  Segmented,
  useToast,
} from '../../components/seller/SellerUI';

type Filter = 'all' | 'to_fulfill' | 'shipped' | 'done' | 'cancelled' | 'awaiting';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'to_fulfill', label: 'To fulfill' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'awaiting', label: 'Awaiting payment' },
];

const STATUS_LABEL: Record<string, string> = {
  pending: 'New',
  processing: 'Preparing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const ACTION_LABEL: Record<OrderStatus, string> = {
  pending: 'Mark as new',
  processing: 'Start preparing',
  shipped: 'Mark as shipped',
  delivered: 'Mark as delivered',
  completed: 'Mark as completed',
  cancelled: 'Cancel order',
};

function isAwaiting(o: SellerOrderRow) {
  if (o.awaiting_payment !== undefined) return o.awaiting_payment;
  return o.payment_status !== 'paid' && o.payment_status !== 'refunded';
}

function matchesFilter(o: SellerOrderRow, f: Filter) {
  const awaiting = isAwaiting(o);
  switch (f) {
    case 'all':
      return true;
    case 'awaiting':
      return awaiting && o.status !== 'cancelled';
    case 'to_fulfill':
      return !awaiting && (o.status === 'pending' || o.status === 'processing');
    case 'shipped':
      return o.status === 'shipped';
    case 'done':
      return o.status === 'delivered' || o.status === 'completed';
    case 'cancelled':
      return o.status === 'cancelled';
  }
}

function StatusPill({ order }: { order: SellerOrderRow }) {
  if (isAwaiting(order) && order.status !== 'cancelled') {
    return <span className="inline-flex whitespace-nowrap rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600">Awaiting payment</span>;
  }
  const tone: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    processing: 'bg-sky-100 text-sky-800',
    shipped: 'bg-indigo-100 text-indigo-800',
    delivered: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone[order.status] || 'bg-stone-100 text-stone-700'}`}>
      {STATUS_LABEL[order.status] || order.status}
    </span>
  );
}

function shortId(id: string) {
  return `#${id.replace(/^order_?/, '').slice(-8).toUpperCase()}`;
}

function orderTotal(o: SellerOrderRow) {
  return o.business_total ?? o.total;
}

const ADDRESS_ORDER = ['name', 'full_name', 'line1', 'address', 'street', 'line2', 'postal_code', 'zip', 'city', 'state', 'country', 'phone'];

function addressLines(addr: Record<string, unknown> | undefined): string[] {
  if (!addr || typeof addr !== 'object') return [];
  const entries = Object.entries(addr).filter(([, v]) => typeof v === 'string' || typeof v === 'number');
  entries.sort(([a], [b]) => {
    const ia = ADDRESS_ORDER.indexOf(a);
    const ib = ADDRESS_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const lines: string[] = [];
  const pc = String(addr.postal_code ?? addr.zip ?? '').trim();
  const city = String(addr.city ?? '').trim();
  for (const [k, v] of entries) {
    const s = String(v).trim();
    if (!s) continue;
    if (k === 'postal_code' || k === 'zip' || k === 'city') continue;
    if (k === 'country' && (pc || city)) {
      lines.push([pc, city].filter(Boolean).join(' '));
    }
    lines.push(s);
  }
  if ((pc || city) && !entries.some(([k]) => k === 'country')) lines.push([pc, city].filter(Boolean).join(' '));
  return lines;
}

function addressName(addr: Record<string, unknown> | undefined): string {
  const n = addr?.name ?? addr?.full_name;
  return typeof n === 'string' ? n : '';
}

export function SellerOrdersPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<SellerOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listOrders(0);
      setOrders(list);
      setHasMore(list.length >= ORDERS_PAGE);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load orders'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await listOrders(orders.length);
      setOrders((prev) => {
        const seen = new Set(prev.map((o) => o.id));
        return [...prev, ...next.filter((o) => !seen.has(o.id))];
      });
      setHasMore(next.length >= ORDERS_PAGE);
    } catch (e) {
      toast(errorMessage(e, 'Failed to load more orders'), 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (!matchesFilter(o, filter)) return false;
      if (!q) return true;
      const hay = [
        o.id,
        shortId(o.id),
        ...(o.items || []).map((i) => i.product_name || ''),
        ...Object.values(o.shipping_address || {}).map((v) => (typeof v === 'string' ? v : '')),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [orders, filter, query]);

  useEffect(() => setPage(1), [filter, query]);

  const counts = useMemo(() => {
    const c: Partial<Record<Filter, number>> = {};
    for (const f of FILTERS) c[f.value] = orders.filter((o) => matchesFilter(o, f.value)).length;
    return c;
  }, [orders]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = orders.find((o) => o.id === selectedId) || null;

  function onUpdated(updated: Partial<SellerOrderRow> & { id: string }) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
  }

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Prepare, ship and close out customer orders. Refunds are handled by the Grow! team."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchField value={query} onChange={setQuery} placeholder="Search order, product, customer…" label="Search orders" />
        <div className="overflow-x-auto">
          <Segmented
            label="Filter orders by status"
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((f) => ({
              value: f.value,
              label: counts[f.value] ? `${f.label} (${counts[f.value]})` : f.label,
            }))}
          />
        </div>
      </div>

      <Card className="overflow-hidden !p-0">
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock message={error} onRetry={() => void load()} />
        ) : orders.length === 0 ? (
          <EmptyBlock
            icon={ShoppingBag}
            title="No orders yet"
            description="Checkout in the Grow! app is paused for now, so people can browse and save your products but not buy yet. Your views and saves are in Insights."
            action={
              <Link to="/seller/insights" className="focus-ring inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                Open Insights
              </Link>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyBlock title="No orders match" description="Try another search or status filter." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-xs font-semibold uppercase tracking-wide text-stone-500">
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="hidden px-4 py-3 sm:table-cell">Items</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {pageRows.map((o) => {
                    const items = o.items || [];
                    const name = addressName(o.shipping_address);
                    return (
                      <tr key={o.id} className="cursor-pointer transition-colors hover:bg-surface-page/80" onClick={() => setSelectedId(o.id)}>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="focus-ring rounded font-semibold text-brand-700 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(o.id);
                            }}
                            aria-label={`Open order ${shortId(o.id)}`}
                          >
                            {shortId(o.id)}
                          </button>
                          {name && <p className="text-xs text-stone-500">{name}</p>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatDate(o.created_at, true)}</td>
                        <td className="hidden max-w-[280px] truncate px-4 py-3 text-stone-600 sm:table-cell">
                          {items.length === 0
                            ? '—'
                            : items.map((i) => `${i.product_name || 'Product'} × ${i.quantity}`).join(', ')}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{formatEur(orderTotal(o))}</td>
                        <td className="px-4 py-3">
                          <StatusPill order={o} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={filtered.length} onChange={setPage} />
          </>
        )}
      </Card>

      {hasMore && !loading && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" loading={loadingMore} onClick={() => void loadMore()}>
            Load older orders
          </Button>
        </div>
      )}

      <OrderDetail order={selected} onClose={() => setSelectedId(null)} onUpdated={onUpdated} />
    </div>
  );
}

function OrderDetail({
  order,
  onClose,
  onUpdated,
}: {
  order: SellerOrderRow | null;
  onClose: () => void;
  onUpdated: (o: Partial<SellerOrderRow> & { id: string }) => void;
}) {
  const toast = useToast();
  const [customer, setCustomer] = useState<string | null>(null);
  const [tracking, setTracking] = useState('');
  const [carrier, setCarrier] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const orderId = order?.id;
  useEffect(() => {
    if (!order) return;
    const meta = (order.metadata || {}) as Record<string, unknown>;
    setTracking(String(meta.tracking_number || ''));
    setCarrier(String(meta.carrier || ''));
    setCustomer(null);
    let cancelled = false;
    getOrderContact(order.id)
      .then((c) => !cancelled && setCustomer(c.customer?.username || null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (!order) return <Modal open={false} title="" onClose={onClose}>{null}</Modal>;

  const awaiting = isAwaiting(order);
  const next = (NEXT_STATUSES[order.status as OrderStatus] || []).filter((s) => !awaiting || s === 'cancelled');
  const forward = next.filter((s) => s !== 'cancelled');
  const canCancel = next.includes('cancelled');
  const address = addressLines(order.shipping_address);
  const nameOnAddress = addressName(order.shipping_address);
  const meta = (order.metadata || {}) as Record<string, unknown>;
  const fulfillmentChanged = tracking !== String(meta.tracking_number || '') || carrier !== String(meta.carrier || '');

  async function move(status: OrderStatus) {
    if (!order) return;
    setBusy(status);
    try {
      await setOrderStatus(order.id, status);
      onUpdated({ id: order.id, status });
      toast(status === 'cancelled' ? 'Order cancelled' : `Order marked ${STATUS_LABEL[status].toLowerCase()}`);
      setConfirmCancel(false);
    } catch (e) {
      toast(errorMessage(e, 'Could not update the order'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function saveTracking() {
    if (!order) return;
    setBusy('tracking');
    try {
      await setOrderFulfillment(order.id, {
        ...(tracking.trim() ? { tracking_number: tracking.trim() } : {}),
        ...(carrier.trim() ? { carrier: carrier.trim() } : {}),
      });
      onUpdated({ id: order.id, metadata: { ...meta, tracking_number: tracking.trim(), carrier: carrier.trim() } });
      toast('Tracking saved');
    } catch (e) {
      toast(errorMessage(e, 'Could not save tracking'), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Modal
        open={!!order}
        onClose={onClose}
        size="lg"
        title={`Order ${shortId(order.id)}`}
        description={`Placed ${formatDate(order.created_at, true)}`}
      >
        <div className="grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="space-y-5">
            <section aria-labelledby="order-items">
              <h3 id="order-items" className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-800">
                <PackageIcon className="h-4 w-4 text-brand-600" aria-hidden /> Items
              </h3>
              <ul className="divide-y divide-surface-border rounded-xl border border-surface-border">
                {(order.items || []).map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    {item.product_image ? (
                      <img src={item.product_image} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-surface-muted" aria-hidden />
                    )}
                    <span className="flex-1">
                      {item.product_name || 'Product'} <span className="text-stone-500">× {item.quantity}</span>
                    </span>
                    <span className="tabular-nums">{formatEur(item.price * item.quantity)}</span>
                  </li>
                ))}
                <li className="flex justify-between px-3 py-2.5 text-sm font-semibold">
                  <span>Your total</span>
                  <span className="tabular-nums">{formatEur(orderTotal(order))}</span>
                </li>
              </ul>
            </section>

            <section aria-labelledby="order-ship" className="rounded-xl border border-surface-border p-4">
              <h3 id="order-ship" className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-800">
                <Truck className="h-4 w-4 text-brand-600" aria-hidden /> Tracking
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Carrier">
                  <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Post Luxembourg, DHL…" maxLength={60} />
                </Field>
                <Field label="Tracking number">
                  <Input value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={120} />
                </Field>
              </div>
              <Button
                variant="outline"
                loading={busy === 'tracking'}
                disabled={!fulfillmentChanged || (!tracking.trim() && !carrier.trim())}
                onClick={() => void saveTracking()}
              >
                Save tracking
              </Button>
            </section>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl bg-surface-page p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Status</p>
              <div className="mt-2">
                <StatusPill order={order} />
              </div>
              {awaiting && order.status !== 'cancelled' && (
                <p className="mt-2 text-xs text-stone-500">The customer hasn’t paid yet, so this order can’t be fulfilled.</p>
              )}
              <div className="mt-3 flex flex-col gap-2">
                {forward.map((s) => (
                  <Button key={s} loading={busy === s} disabled={!!busy} onClick={() => void move(s)}>
                    {ACTION_LABEL[s]}
                  </Button>
                ))}
                {canCancel && (
                  <Button variant="outline" className="!text-red-600" disabled={!!busy} onClick={() => setConfirmCancel(true)}>
                    Cancel order…
                  </Button>
                )}
                {next.length === 0 && <p className="text-xs text-stone-500">Nothing left to do on this order.</p>}
              </div>
            </div>

            <div className="rounded-xl border border-surface-border p-4 text-sm">
              <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <User className="h-3.5 w-3.5" aria-hidden /> Customer
              </p>
              <p className="font-medium text-stone-900">{nameOnAddress || customer || 'Grow! member'}</p>
              {customer && nameOnAddress && customer !== nameOnAddress && (
                <p className="text-xs text-stone-500">@{customer}</p>
              )}
            </div>

            <div className="rounded-xl border border-surface-border p-4 text-sm">
              <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> Ship to
              </p>
              {address.length ? (
                <address className="not-italic leading-relaxed text-stone-700">
                  {address.map((l, i) => (
                    <span key={i} className="block">
                      {l}
                    </span>
                  ))}
                </address>
              ) : (
                <p className="text-stone-500">No shipping address on this order.</p>
              )}
            </div>
            {order.payment_status === 'refunded' && <InlineNotice tone="warn">This order was refunded.</InlineNotice>}
          </aside>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this order?"
        message="The customer will see it as cancelled and paid stock goes back to your inventory. This can’t be undone. Refunds are handled by the Grow! team."
        confirmLabel="Yes, cancel order"
        variant="danger"
        loading={busy === 'cancelled'}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void move('cancelled')}
      />
    </>
  );
}
