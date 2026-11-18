import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  adminRequest,
  getBusinessOrder,
  listQuery,
  newIdempotencyKey,
  refundOrder as postRefund,
  type Paged,
} from '../services/api/adminClient';
import { useAdminAuth } from '../auth/AdminAuthProvider';
import { useAdminToast, errorMessage } from '../components/admin/Toast';
import { SearchBar, Pager } from '../components/admin/ListControls';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AlertBanner, InfoBanner } from '../components/ui/AlertBanner';
import { Field, Input, Select, Textarea } from '../components/ui/Input';
import { Badge, statusBadge } from '../components/ui/Badge';
import { TableSkeleton } from '../components/ui/Skeleton';
import { DataTable, DataTableHead, DataTableHeaderCell, DataTableBody, DataTableRow, DataTableCell, EmptyState } from '../components/ui/DataTable';
import { SlideOver } from '../components/ui/Dialog';
import { KpiCard } from '../components/ui/KpiCard';
import { Euro, AlertTriangle, Flag } from 'lucide-react';
import { staggerContainer, modalOverlay, modalPanel } from '../lib/motion';

type Order = {
  id: string;
  customer_email?: string;
  total: number;
  status: string;
  payment_status: string;
  refund_amount?: number;
  created_at: string;
};

type PartnershipFlag = { id: string; instructor_id: string; status: string; created_at: string };

type RiskSignals = {
  refunds_7d?: { count: number; total: number };
  reports_24h?: number;
  repeat_offenders?: { user_id: string; strike_count: number; status: string }[];
};

const PAGE_SIZE = 50;
const eur = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);

function remainingOf(o: Order): number {
  return Math.max(0, Math.round((Number(o.total) - Number(o.refund_amount || 0)) * 100) / 100);
}

/** Two steps: enter amount + reason, then confirm. One idempotency key per dialog, so retries never double-refund. */
function RefundDialog({
  order,
  onClose,
  onDone,
}: {
  order: Order | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useAdminToast();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [key, setKey] = useState('');

  useEffect(() => {
    if (order) {
      setAmount(remainingOf(order).toFixed(2));
      setReason('');
      setConfirming(false);
      setFormError('');
      setKey(newIdempotencyKey());
    }
  }, [order]);

  if (!order) return null;
  const remaining = remainingOf(order);
  const value = Math.round(Number(amount.replace(',', '.')) * 100) / 100;

  function review(e: FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(value) || value <= 0) return setFormError('Enter an amount above 0');
    if (value > remaining) return setFormError(`At most ${eur(remaining)} can still be refunded`);
    if (reason.trim().length < 3) return setFormError('Add a reason (at least 3 characters)');
    setFormError('');
    setConfirming(true);
  }

  async function submit() {
    if (!order) return;
    setBusy(true);
    try {
      const res = await postRefund(order.id, { amount: value, reasonText: reason.trim() }, key);
      toast.success(
        res.payment_status === 'refunded'
          ? `Refunded ${eur(res.refund_amount)} — order fully refunded${res.restocked ? ' and stock returned' : ''}`
          : `Refunded ${eur(res.refund_amount)} — ${eur(res.remaining)} left`
      );
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, 'Refund failed'));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const full = value >= remaining;
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          variants={modalOverlay}
          initial="initial"
          animate="animate"
          exit="exit"
          className="absolute inset-0 bg-stone-900/50 backdrop-blur-sm"
          onClick={busy ? undefined : onClose}
        />
        <motion.div
          variants={modalPanel}
          initial="initial"
          animate="animate"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-title"
          className="relative z-10 w-full max-w-md rounded-2xl border border-surface-border bg-surface p-6 shadow-xl"
        >
          <h3 id="refund-title" className="text-lg font-semibold text-stone-900">
            {confirming ? 'Confirm refund' : 'Refund order'}
          </h3>
          <p className="mt-1 text-sm text-stone-500">
            Order {order.id.slice(0, 12)}… · total {eur(order.total)} · {eur(remaining)} refundable
          </p>
          {!confirming ? (
            <form onSubmit={review} className="mt-4">
              <Field label="Amount (EUR)">
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-describedby="refund-hint"
                  autoFocus
                />
              </Field>
              <p id="refund-hint" className="-mt-2 mb-4 text-xs text-stone-500">
                Leave the full amount for a full refund. A full refund of an unshipped order cancels it and returns the stock.
              </p>
              <Field label="Reason">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </Field>
              {formError && <p className="mb-3 text-sm text-red-700" role="alert">{formError}</p>}
              <div className="mt-2 flex justify-end gap-3">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button type="submit" variant="danger">Review refund</Button>
              </div>
            </form>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-stone-700">
                Refund <strong>{eur(value)}</strong>
                {full ? ' (full refund)' : ` (partial — ${eur(remaining - value)} stays paid)`}. This is recorded in the audit
                log. Remember to return the money in Stripe.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Back</Button>
                <Button variant="danger" loading={busy} onClick={() => void submit()}>Refund {eur(value)}</Button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export function BusinessOrdersPage() {
  const { can } = useAdminAuth();
  const toast = useAdminToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState<Paged>({ total: 0, limit: PAGE_SIZE, offset: 0, has_more: false });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState<PartnershipFlag[]>([]);
  const [risk, setRisk] = useState<RiskSignals | null>(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Record<string, unknown> | null>(null);
  const [viewingId, setViewingId] = useState('');
  const [refundTarget, setRefundTarget] = useState<Order | null>(null);
  const canRefund = can('business.refund') && paymentsEnabled === true;

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminRequest<{ orders: Order[] } & Paged>(
        `/admin/business/orders${listQuery({ q, status, limit: PAGE_SIZE, offset })}`
      );
      setOrders(res.orders || []);
      setPage(res);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load orders'));
    } finally {
      setLoading(false);
    }
  }, [q, status, offset]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    Promise.all([
      adminRequest<RiskSignals>('/admin/business/risk-signals'),
      adminRequest<{ flags: PartnershipFlag[] }>('/admin/business/partnerships/flags'),
    ])
      .then(([riskRes, flagsRes]) => {
        setRisk(riskRes);
        setFlags(flagsRes.flags || []);
      })
      .catch((e) => setError(errorMessage(e, 'Failed to load signals')));
    adminRequest<{ enabled: boolean }>('/marketplace/payment-config')
      .then((r) => setPaymentsEnabled(!!r.enabled))
      .catch(() => setPaymentsEnabled(false));
  }, []);

  async function viewOrder(orderId: string) {
    setViewingId(orderId);
    try {
      setSelectedOrder(await getBusinessOrder(orderId));
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to load order'));
    } finally {
      setViewingId('');
    }
  }

  return (
    <div>
      <PageHeader title="Business Oversight" subtitle="Orders, refunds, and partnership flags" />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}
      {paymentsEnabled === false && (
        <InfoBanner message="Payments are turned off (shop is browse-only), so refunds are unavailable." />
      )}

      {risk && (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="mb-8 grid gap-4 sm:grid-cols-3">
          <KpiCard label="Refunds (7d)" value={eur(Number(risk.refunds_7d?.total ?? 0))} icon={Euro} accent="bg-red-50 text-red-600" />
          <KpiCard label="Reports (24h)" value={risk.reports_24h ?? 0} icon={Flag} accent="bg-amber-50 text-amber-600" />
          <KpiCard label="Repeat offenders" value={(risk.repeat_offenders || []).length} icon={AlertTriangle} accent="bg-orange-50 text-orange-600" />
        </motion.div>
      )}

      {flags.length > 0 && (
        <Card className="mb-6" padding="md">
          <h3 className="mb-4 font-semibold text-stone-800">Pending partnerships ({flags.length})</h3>
          <DataTable>
            <DataTableHead>
              <DataTableHeaderCell>Instructor</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell>Created</DataTableHeaderCell>
            </DataTableHead>
            <DataTableBody>
              {flags.map((f) => (
                <DataTableRow key={f.id}>
                  <DataTableCell className="font-mono text-xs">{f.instructor_id}</DataTableCell>
                  <DataTableCell>{f.status}</DataTableCell>
                  <DataTableCell className="text-stone-500">{new Date(f.created_at).toLocaleString()}</DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        </Card>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-48">
          <Field label="Status">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
        </div>
        <div className="mb-4 flex-1">
          <SearchBar
            value={q}
            label="Search orders"
            placeholder="Order ID, customer email or business ID"
            onSearch={(v) => {
              setQ(v);
              setOffset(0);
            }}
          />
        </div>
      </div>

      <Card padding="sm">
        {loading ? (
          <div className="p-4"><TableSkeleton rows={6} cols={6} /></div>
        ) : orders.length === 0 ? (
          <EmptyState title="No orders" description={q ? 'Nothing matches that search.' : 'Orders appear here once checkout is on.'} />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableHeaderCell>Order</DataTableHeaderCell>
              <DataTableHeaderCell>Customer</DataTableHeaderCell>
              <DataTableHeaderCell>Total</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell>Payment</DataTableHeaderCell>
              <DataTableHeaderCell>Refunded</DataTableHeaderCell>
              <DataTableHeaderCell>Actions</DataTableHeaderCell>
            </DataTableHead>
            <DataTableBody>
              {orders.map((o) => {
                const refundable = o.payment_status === 'paid' && remainingOf(o) > 0;
                return (
                  <DataTableRow key={o.id}>
                    <DataTableCell className="font-mono text-xs">{o.id.slice(0, 12)}…</DataTableCell>
                    <DataTableCell>{o.customer_email}</DataTableCell>
                    <DataTableCell>{eur(o.total)}</DataTableCell>
                    <DataTableCell><Badge variant={statusBadge(o.status)}>{o.status}</Badge></DataTableCell>
                    <DataTableCell>{o.payment_status}</DataTableCell>
                    <DataTableCell>{eur(Number(o.refund_amount || 0))}</DataTableCell>
                    <DataTableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" loading={viewingId === o.id} onClick={() => void viewOrder(o.id)}>
                          View
                        </Button>
                        {canRefund && refundable && (
                          <Button variant="danger" onClick={() => setRefundTarget(o)}>Refund</Button>
                        )}
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTableBody>
          </DataTable>
        )}
      </Card>
      {!loading && <Pager offset={page.offset} limit={page.limit} total={page.total} count={orders.length} onChange={setOffset} />}

      <SlideOver open={!!selectedOrder} title="Order detail" onClose={() => setSelectedOrder(null)}>
        <pre className="overflow-auto rounded-lg bg-stone-50 p-4 text-xs">{JSON.stringify(selectedOrder, null, 2)}</pre>
      </SlideOver>

      <RefundDialog
        order={refundTarget}
        onClose={() => setRefundTarget(null)}
        onDone={() => {
          setRefundTarget(null);
          void loadOrders();
        }}
      />
    </div>
  );
}
