import { useEffect, useState } from 'react';
import { adminRequest } from '../services/api/adminClient';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Field, Input, Select } from '../components/ui/Input';
import { AlertBanner } from '../components/ui/AlertBanner';
import { DataTable, DataTableHead, DataTableHeaderCell, DataTableBody, DataTableRow, DataTableCell } from '../components/ui/DataTable';
import { TableSkeleton } from '../components/ui/Skeleton';

type AuditLog = {
  id: string;
  admin_email: string;
  action: string;
  target_type: string;
  target_id: string;
  reason_text?: string;
  created_at: string;
};

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState('');
  const [targetType, setTargetType] = useState('');
  const [targetId, setTargetId] = useState('');
  const [limit, setLimit] = useState('100');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (targetType) params.set('target_type', targetType);
    if (targetId) params.set('target_id', targetId);
    if (limit) params.set('limit', limit);
    adminRequest<{ logs: AuditLog[] }>(`/admin/audit/logs?${params}`)
      .then((res) => setLogs(res.logs || []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [targetType, targetId, limit]);

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Immutable record of admin actions" />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      <Card className="mb-6" padding="md">
        <div className="flex flex-wrap gap-4">
          <Field label="Target type"><Input value={targetType} onChange={(e) => setTargetType(e.target.value)} placeholder="user, report…" className="min-w-[140px]" /></Field>
          <Field label="Target ID"><Input value={targetId} onChange={(e) => setTargetId(e.target.value)} className="min-w-[180px]" /></Field>
          <Field label="Limit"><Select value={limit} onChange={(e) => setLimit(e.target.value)} className="w-24"><option value="50">50</option><option value="100">100</option><option value="200">200</option><option value="500">500</option></Select></Field>
        </div>
      </Card>

      <Card padding="sm">
        {loading ? (
          <div className="p-4"><TableSkeleton rows={8} cols={5} /></div>
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableHeaderCell>Time</DataTableHeaderCell>
              <DataTableHeaderCell>Admin</DataTableHeaderCell>
              <DataTableHeaderCell>Action</DataTableHeaderCell>
              <DataTableHeaderCell>Target</DataTableHeaderCell>
              <DataTableHeaderCell>Reason</DataTableHeaderCell>
            </DataTableHead>
            <DataTableBody>
              {logs.map((l) => (
                <DataTableRow key={l.id}>
                  <DataTableCell className="whitespace-nowrap text-slate-500">{new Date(l.created_at).toLocaleString()}</DataTableCell>
                  <DataTableCell>{l.admin_email}</DataTableCell>
                  <DataTableCell><span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium">{l.action}</span></DataTableCell>
                  <DataTableCell className="font-mono text-xs text-slate-600">{l.target_type}:{l.target_id}</DataTableCell>
                  <DataTableCell className="text-slate-500">{l.reason_text || '—'}</DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </Card>
    </div>
  );
}
