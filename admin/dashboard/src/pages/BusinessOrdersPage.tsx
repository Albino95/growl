import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { adminRequest, getBusinessOrder } from '../services/api/adminClient';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AlertBanner } from '../components/ui/AlertBanner';
import { DataTable, DataTableHead, DataTableHeaderCell, DataTableBody, DataTableRow, DataTableCell } from '../components/ui/DataTable';
import { PromptDialog, SlideOver } from '../components/ui/Dialog';
import { KpiCard } from '../components/ui/KpiCard';
import { DollarSign, AlertTriangle, Flag } from 'lucide-react';
import { staggerContainer } from '../lib/motion';

type Order = {
  id: string;
  customer_email?: string;
  total: number;
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

export function BusinessOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [flags, setFlags] = useState<PartnershipFlag[]>([]);
  const [risk, setRisk] = useState<RiskSignals | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Record<string, unknown> | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);

  useEffect(() => {
    Promise.all([
      adminRequest<{ orders: Order[] }>('/admin/business/orders'),
      adminRequest<RiskSignals>('/admin/business/risk-signals'),
      adminRequest<{ flags: PartnershipFlag[] }>('/admin/business/partnerships/flags'),
    ])
      .then(([ordersRes, riskRes, flagsRes]) => {
        setOrders(ordersRes.orders || []);
        setRisk(riskRes);
        setFlags(flagsRes.flags || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  function startRefund(order: Order) {
    setRefundOrder(order);
  }

  async function processRefund(reasonText: string) {
    if (!refundOrder || reasonText.length < 3) return;
    setBusyId(refundOrder.id);
    setError('');
    try {
      await adminRequest(`/admin/business/orders/${refundOrder.id}/refund`, {
        method: 'POST',
        body: JSON.stringify({ amount: refundOrder.total, reasonText }),
      });
      const refreshed = await adminRequest<{ orders: Order[] }>('/admin/business/orders');
      setOrders(refreshed.orders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refund failed');
    } finally {
      setBusyId('');
      setRefundOrder(null);
    }
  }

  async function viewOrder(orderId: string) {
    try {
      setSelectedOrder(await getBusinessOrder(orderId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load order');
    }
  }

  return (
    <div>
      <PageHeader title="Business Oversight" subtitle="Orders, refunds, and partnership flags" />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      {risk && (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="mb-8 grid gap-4 sm:grid-cols-3">
          <KpiCard label="Refunds (7d)" value={`$${Number(risk.refunds_7d?.total ?? 0).toFixed(0)}`} icon={DollarSign} accent="bg-red-50 text-red-600" />
          <KpiCard label="Reports (24h)" value={risk.reports_24h ?? 0} icon={Flag} accent="bg-amber-50 text-amber-600" />
          <KpiCard label="Repeat offenders" value={(risk.repeat_offenders || []).length} icon={AlertTriangle} accent="bg-orange-50 text-orange-600" />
        </motion.div>
      )}

      {flags.length > 0 && (
        <Card className="mb-6" padding="md">
          <h3 className="mb-4 font-semibold text-slate-800">Pending partnerships ({flags.length})</h3>
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
                  <DataTableCell className="text-slate-500">{new Date(f.created_at).toLocaleString()}</DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        </Card>
      )}

      <Card padding="sm">
        <DataTable>
          <DataTableHead>
            <DataTableHeaderCell>Order</DataTableHeaderCell>
            <DataTableHeaderCell>Customer</DataTableHeaderCell>
            <DataTableHeaderCell>Total</DataTableHeaderCell>
            <DataTableHeaderCell>Payment</DataTableHeaderCell>
            <DataTableHeaderCell>Refunded</DataTableHeaderCell>
            <DataTableHeaderCell>Actions</DataTableHeaderCell>
          </DataTableHead>
          <DataTableBody>
            {orders.map((o) => (
              <DataTableRow key={o.id}>
                <DataTableCell className="font-mono text-xs">{o.id.slice(0, 12)}…</DataTableCell>
                <DataTableCell>{o.customer_email}</DataTableCell>
                <DataTableCell>${Number(o.total).toFixed(2)}</DataTableCell>
                <DataTableCell>{o.payment_status}</DataTableCell>
                <DataTableCell>${Number(o.refund_amount || 0).toFixed(2)}</DataTableCell>
                <DataTableCell>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => void viewOrder(o.id)}>View</Button>
                    <Button variant="danger" disabled={busyId === o.id} onClick={() => startRefund(o)}>Refund</Button>
                  </div>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      </Card>

      <SlideOver open={!!selectedOrder} title="Order detail" onClose={() => setSelectedOrder(null)}>
        <pre className="overflow-auto rounded-lg bg-slate-50 p-4 text-xs">{JSON.stringify(selectedOrder, null, 2)}</pre>
      </SlideOver>

      <PromptDialog
        open={!!refundOrder}
        title={`Refund $${refundOrder?.total.toFixed(2)}`}
        message="Enter reason for full refund (min 3 characters)."
        placeholder="Refund reason"
        confirmLabel="Process refund"
        loading={!!busyId}
        onConfirm={(v) => void processRefund(v)}
        onCancel={() => setRefundOrder(null)}
      />
    </div>
  );
}
