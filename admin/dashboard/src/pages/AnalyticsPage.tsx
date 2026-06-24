import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { adminRequest } from '../services/api/adminClient';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { AlertBanner } from '../components/ui/AlertBanner';
import { PageLoader } from '../components/ui/Skeleton';

type Analytics = {
  report_status_mix: { workflow_status: string; count: number }[];
  enforcement_mix: { action: string; count: number }[];
  appeal_outcomes: { status: string; count: number }[];
};

function BarChart({ title, rows, labelKey, valueKey }: { title: string; rows: Record<string, unknown>[]; labelKey: string; valueKey: string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey] || 0)));
  return (
    <Card padding="lg">
      <h3 className="mb-6 font-semibold text-slate-800">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No data yet</p>
      ) : (
        <div className="space-y-4">
          {rows.map((r, i) => {
            const value = Number(r[valueKey] || 0);
            const pct = (value / max) * 100;
            return (
              <div key={i}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-medium text-slate-700">{String(r[labelKey])}</span>
                  <span className="text-slate-500">{value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: i * 0.08, duration: 0.5, ease: 'easeOut' }}
                    className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminRequest<Analytics>('/admin/dashboard/analytics')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Moderation and enforcement metrics" />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}
      {!data ? (
        <PageLoader />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <BarChart title="Report status" rows={data.report_status_mix as Record<string, unknown>[]} labelKey="workflow_status" valueKey="count" />
          <BarChart title="Enforcement actions" rows={data.enforcement_mix as Record<string, unknown>[]} labelKey="action" valueKey="count" />
          <BarChart title="Appeal outcomes" rows={data.appeal_outcomes as Record<string, unknown>[]} labelKey="status" valueKey="count" />
        </div>
      )}
    </div>
  );
}
