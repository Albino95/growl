import { useEffect, useState } from 'react';
import { sellerRequest, type SellerOrder } from '../../services/api/sellerClient';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Input';
import { AlertBanner } from '../../components/ui/AlertBanner';
import { Badge, statusBadge } from '../../components/ui/Badge';
import { SlideOver } from '../../components/ui/Dialog';
import {
  DataTable,
  DataTableHead,
  DataTableHeaderCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
  EmptyState,
} from '../../components/ui/DataTable';
import { PageLoader } from '../../components/ui/Skeleton';

const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'] as const;

export function SellerOrdersPage() {
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SellerOrder | null>(null);
  const [status, setStatus] = useState('processing');
  const [tracking, setTracking] = useState('');
  const [carrier, setCarrier] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await sellerRequest<SellerOrder[] | { orders: SellerOrder[] }>('/business/orders');
      setOrders(Array.isArray(res) ? res : res.orders || []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openOrder(o: SellerOrder) {
    setSelected(o);
    setStatus(o.status || 'pending');
    const meta = (o.metadata || {}) as Record<string, string>;
    setTracking(meta.tracking_number || '');
    setCarrier(meta.carrier || '');
  }

  async function saveFulfillment() {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      if (status !== selected.status) {
        await sellerRequest(`/marketplace/orders/${selected.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });
      }
      if (tracking || carrier) {
        await sellerRequest(`/business/orders/${selected.id}/fulfillment`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...(tracking ? { tracking_number: tracking } : {}),
            ...(carrier ? { carrier } : {}),
          }),
        });
      }
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Fulfill your customers’ orders. Platform refunds are handled by Grow! ops — not shown here."
      />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      <Card className="!p-0 overflow-hidden">
        {orders.length === 0 ? (
          <EmptyState title="No orders yet" description="Orders for your products will appear here." />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableHeaderCell>Order</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell>Total</DataTableHeaderCell>
              <DataTableHeaderCell>Created</DataTableHeaderCell>
            </DataTableHead>
            <DataTableBody>
              {orders.map((o) => (
                <DataTableRow key={o.id}>
                  <DataTableCell>
                    <button
                      type="button"
                      className="font-medium text-emerald-700 hover:underline"
                      onClick={() => openOrder(o)}
                    >
                      {o.id.slice(0, 12)}…
                    </button>
                  </DataTableCell>
                  <DataTableCell>
                    <Badge variant={statusBadge(o.status)}>{o.status}</Badge>
                  </DataTableCell>
                  <DataTableCell>${Number(o.total).toFixed(2)}</DataTableCell>
                  <DataTableCell className="text-slate-500">
                    {new Date(o.created_at).toLocaleString()}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </Card>

      <SlideOver open={!!selected} title="Order detail" onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">ID: {selected.id}</p>
            <ul className="space-y-2 text-sm">
              {(selected.items || []).map((item) => (
                <li key={item.id} className="flex justify-between border-b border-slate-100 py-2">
                  <span>
                    {item.product_name || item.product_id} × {item.quantity}
                  </span>
                  <span>${Number(item.price).toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Carrier">
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="UPS, USPS…" />
            </Field>
            <Field label="Tracking number">
              <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
            </Field>
            <p className="text-xs text-slate-500">
              Updating carrier/tracking requires at least one fulfillment field. Status updates use the marketplace
              order API.
            </p>
            <Button loading={saving} onClick={() => void saveFulfillment()}>
              Save updates
            </Button>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
