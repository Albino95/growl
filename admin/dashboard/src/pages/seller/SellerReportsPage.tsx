import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { sellerDownloadCsv } from '../../services/api/sellerClient';
import CATEGORIES from '../../data/categories';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Input';
import { AlertBanner } from '../../components/ui/AlertBanner';

const LAST_EXPORT_KEY = 'seller_last_export_at';

type Period = 'today' | 'week' | 'month';

export function SellerReportsPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(() => localStorage.getItem(LAST_EXPORT_KEY));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  }, []);

  function markExported() {
    const ts = new Date().toISOString();
    localStorage.setItem(LAST_EXPORT_KEY, ts);
    setLastExport(ts);
  }

  async function run(key: string, fn: () => Promise<void>) {
    setError('');
    setBusy(key);
    try {
      await fn();
      markExported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Download CSV exports for accounting and inventory. PDF / scheduled email reports are planned later."
      />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}
      {lastExport && (
        <p className="mb-4 text-xs text-slate-500">
          Last export: {new Date(lastExport).toLocaleString()}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card padding="lg">
          <div className="mb-4 flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold text-slate-900">Orders & products</h2>
          </div>
          <Field label="Orders period">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="today">Today</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </Select>
          </Field>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              loading={busy === 'orders'}
              onClick={() =>
                void run('orders', () =>
                  sellerDownloadCsv(`/business/export/orders?period=${period}`, `orders-${period}.csv`)
                )
              }
            >
              <Download className="h-4 w-4" /> Export orders
            </Button>
            <Button
              variant="outline"
              loading={busy === 'products'}
              onClick={() =>
                void run('products', () => sellerDownloadCsv('/business/export/products', 'products.csv'))
              }
            >
              <Download className="h-4 w-4" /> Export products
            </Button>
          </div>
        </Card>

        <Card padding="lg">
          <div className="mb-4 flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold text-slate-900">Sales report</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            Line items by date range (and optional category): order, product, qty, revenue, refunds.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <Field label="Category (optional)">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            className="mt-2"
            loading={busy === 'sales'}
            disabled={!from || !to}
            onClick={() => {
              const params = new URLSearchParams({ from, to });
              if (category) params.set('category', category);
              void run('sales', () =>
                sellerDownloadCsv(`/business/export/sales?${params}`, `sales-${from}-${to}.csv`)
              );
            }}
          >
            <Download className="h-4 w-4" /> Export sales CSV
          </Button>
        </Card>
      </div>
    </div>
  );
}
